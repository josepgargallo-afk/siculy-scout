import 'fake-indexeddb/auto';
import { ScoutDB, useDb } from '../lib/db';
import { uuid } from '../lib/ids';

export function freshDb(name = 'test-' + uuid()) {
  const d = new ScoutDB(name);
  useDb(d);
  return d;
}

export function bytesBlob(bytes: number[] | Uint8Array, type: string) {
  return new Blob([new Uint8Array(bytes)], { type });
}

export async function blobToArray(b: Blob): Promise<number[]> {
  return [...new Uint8Array(await b.arrayBuffer())];
}
