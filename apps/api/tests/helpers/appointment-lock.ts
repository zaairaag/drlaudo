import { setImmediate } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import { testDatabaseUrl } from '../../src/env.ts';

export interface WaitingMutation {
  pid: number;
  observerPid: number;
  query: string;
  locktype: string;
  mode: string;
  blockers: number[];
}

export interface AppointmentLock {
  blockerPid: number;
  start<T>(request: () => PromiseLike<T>): Promise<T>;
  waitForWaiters(count: number): Promise<WaitingMutation[]>;
  release(): Promise<void>;
}

/** Only the independent blocker is in this transaction, never an HTTP request. */
export async function withAppointmentLock(
  appointmentId: string,
  run: (lock: AppointmentLock) => Promise<void>,
): Promise<void> {
  const config = { connectionString: testDatabaseUrl(), connectionTimeoutMillis: 5_000 };
  const blocker = new Client(config);
  const observer = new Client({ ...config, statement_timeout: 5_000 });
  const pending: Promise<unknown>[] = [];
  let transactionOpen = false;
  try {
    await blocker.connect();
    await observer.connect();
    await blocker.query('BEGIN');
    transactionOpen = true;
    const identity = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const blockerPid = identity.rows[0]?.pid;
    if (blockerPid === undefined) throw new Error('PostgreSQL não informou o PID bloqueador.');
    const locked = await blocker.query<{ id: string }>(
      'SELECT id FROM "Appointment" WHERE id = $1::uuid FOR UPDATE', [appointmentId],
    );
    if (locked.rows.length !== 1) throw new Error('Agendamento de controle inexistente.');

    await run({
      blockerPid,
      start(request) {
        // Fastify inject is lazy: resolving its thenable actually starts HTTP.
        const running = Promise.resolve(request());
        pending.push(running);
        void running.catch(() => undefined);
        return running;
      },
      async waitForWaiters(count) {
        const deadline = performance.now() + 5_000;
        let observed: WaitingMutation[];
        do {
          const result = await observer.query<WaitingMutation>(`
            WITH RECURSIVE blocked AS (
              SELECT $1::integer AS pid
              UNION
              SELECT activity.pid
              FROM pg_stat_activity AS activity
              JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
              WHERE activity.datname = current_database()
            )
            SELECT DISTINCT ON (activity.pid)
              activity.pid, pg_backend_pid() AS "observerPid", activity.query,
              waiting.locktype, waiting.mode, pg_blocking_pids(activity.pid) AS blockers
            FROM pg_stat_activity AS activity
            JOIN pg_locks AS waiting ON waiting.pid = activity.pid AND NOT waiting.granted
            JOIN blocked ON blocked.pid = activity.pid
            WHERE activity.pid <> $1::integer
              AND activity.wait_event_type = 'Lock'
              AND activity.query ILIKE '%FOR UPDATE%'
              AND activity.query LIKE '%"Appointment"%'
            ORDER BY activity.pid
          `, [blockerPid]);
          observed = result.rows;
          if (observed.length >= count) return observed;
          await setImmediate();
        } while (performance.now() < deadline);
        throw new Error(`Esperados ${count} FOR UPDATE em espera; observados ${JSON.stringify(observed)}.`);
      },
      async release() {
        if (transactionOpen) {
          await blocker.query('COMMIT');
          transactionOpen = false;
        }
      },
    });
  } finally {
    if (transactionOpen) await blocker.query('ROLLBACK');
    await Promise.allSettled(pending);
    await Promise.all([blocker.end(), observer.end()]);
  }
}
