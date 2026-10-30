import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(new URL('../package.json', import.meta.url))
const { effectScope, nextTick, ref } = require('vue')
const filename = fileURLToPath(new URL('./table-query-fixture.cjs', import.meta.url))
const output = await build({
  entryPoints: [fileURLToPath(new URL('../src/renderer/src/features/RunDataTable/use-query.ts', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false, external: ['vue'], logLevel: 'silent'
})
const compiled = new Module(filename)
compiled.filename = filename
compiled.paths = Module._nodeModulePaths(path.dirname(filename))
compiled._compile(output.outputFiles[0].text, filename)
const { useRunDataQuery } = compiled.exports

function setup(t, keyword = '') {
  const scope = effectScope()
  t.after(() => scope.stop())
  const query = ref({ dataset: 'jobLibrary', keyword, filters: [], sort: null })
  const requests = [], errors = [], settled = []
  const state = scope.run(() => useRunDataQuery({
    query, pageSize: 20,
    queryPage: payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject })),
    onError: error => errors.push(error),
    onSettled: () => settled.push(true)
  }))
  return { query, state, requests, errors, settled }
}

const page = (data, pageNo = 1) => ({ data, pageNo, totalItemCount: data.length })

test('clearing a query returns to page one and reloads without changing the IPC payload', async t => {
  const { query, state, requests } = setup(t, 'engineer')
  assert.equal(state.isTableLoading.value, true)
  assert.deepEqual(requests[0].payload, {
    dataset: 'jobLibrary', keyword: 'engineer', filters: [], sort: null, pageNo: 1, pageSize: 20
  })
  requests[0].resolve(page([]))
  await nextTick()
  state.pagination.value.pageNo = 3
  query.value = { ...query.value, keyword: '' }
  await nextTick()
  assert.equal(requests[1].payload.keyword, '')
  assert.equal(requests[1].payload.pageNo, 1)
  requests[1].resolve(page([{ encryptJobId: 'saved' }]))
  await nextTick()
  assert.equal(state.tableData.value[0].encryptJobId, 'saved')
  assert.equal(state.pagination.value.totalItemCount, 1)
  assert.equal(state.isTableLoading.value, false)
})

test('a late response cannot replace the results of the current filter', async t => {
  const { query, state, requests, settled } = setup(t)
  query.value = { ...query.value, keyword: 'new filter' }
  await nextTick()
  requests[1].resolve(page([{ encryptJobId: 'current' }]))
  await nextTick()
  requests[0].resolve(page([{ encryptJobId: 'outdated' }]))
  await nextTick()
  assert.equal(state.tableData.value[0].encryptJobId, 'current')
  assert.equal(state.loadError.value, '')
  assert.equal(settled.length, 1)
})

test('read failures remain visible until retry and never look like empty successful results', async t => {
  const { state, requests, errors } = setup(t)
  const error = Error('database is unavailable')
  requests[0].reject(error)
  await nextTick()
  assert.equal(state.loadError.value, error.message)
  assert.deepEqual(state.tableData.value, [])
  assert.equal(state.pagination.value.totalItemCount, 0)
  assert.equal(state.isTableLoading.value, false)
  assert.deepEqual(errors, [error])
  const retry = state.fetchData()
  assert.equal(state.isTableLoading.value, true)
  assert.equal(state.loadError.value, '')
  requests[1].resolve(page([{ encryptJobId: 'recovered' }]))
  await retry
  assert.equal(state.tableData.value[0].encryptJobId, 'recovered')
  assert.equal(state.isTableLoading.value, false)
})

test('an outdated failure does not interrupt the newer pending query or report a false error', async t => {
  const { query, state, requests, errors } = setup(t)
  query.value = { ...query.value, keyword: 'current' }
  await nextTick()
  requests[0].reject(Error('outdated request failed'))
  await nextTick()
  assert.equal(state.isTableLoading.value, true)
  assert.equal(state.loadError.value, '')
  assert.deepEqual(errors, [])
  requests[1].resolve(page([]))
  await nextTick()
  assert.equal(state.isTableLoading.value, false)
})
