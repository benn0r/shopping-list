import { getSyncAdapter, getSyncAdapters } from '../../src/services/sync/syncAdapters';

it('registers Bring and Mealie as simultaneously available adapters', () => {
  expect(getSyncAdapters().map((adapter) => adapter.provider)).toEqual(['bring', 'mealie']);
  expect(getSyncAdapter('bring').provider).toBe('bring');
  expect(getSyncAdapter('mealie').provider).toBe('mealie');
});
