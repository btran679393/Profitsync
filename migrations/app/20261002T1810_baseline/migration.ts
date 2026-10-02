#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/88a64d888c4b164d5dc7db588bc9fc83b62ac1de27edf25e931f7ad6abc151ff/contract';
import endContract from '../../snapshots/88a64d888c4b164d5dc7db588bc9fc83b62ac1de27edf25e931f7ad6abc151ff/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'order',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('ebayFees', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('ebayOrderId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('item', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('orderDate', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('productCost', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('salePrice', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('COST_NEEDED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'order',
        constraint: 'order_ebayOrderId_key',
        columns: ['ebayOrderId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
