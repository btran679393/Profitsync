#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/37b45dad4e0300fa80bdfc839b74044ae8399482559a14eeb48bd3a66b6a2e4b/contract';
import endContract from '../../snapshots/37b45dad4e0300fa80bdfc839b74044ae8399482559a14eeb48bd3a66b6a2e4b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/88a64d888c4b164d5dc7db588bc9fc83b62ac1de27edf25e931f7ad6abc151ff/contract';
import startContract from '../../snapshots/88a64d888c4b164d5dc7db588bc9fc83b62ac1de27edf25e931f7ad6abc151ff/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'ebayConnection',
        columns: [
          col('accessToken', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('accessTokenExpiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('refreshToken', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refreshTokenExpiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
