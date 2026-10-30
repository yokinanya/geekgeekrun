import { onScopeDispose, reactive, toRefs, watch, type Ref } from 'vue'
import type { RunDataQuery } from '../../../../common/run-data'
import type { PagedRes } from '../../../../common/types/pagination'
import type { RunDataRow } from './types'

type PageQuery = RunDataQuery & { pageNo: number; pageSize: number }

interface QueryOptions {
  readonly query: Readonly<Ref<RunDataQuery>>
  readonly pageSize: number
  readonly queryPage: (query: PageQuery) => Promise<PagedRes<RunDataRow>>
  readonly onError: (error: unknown) => void
  readonly onSettled: () => void
}

const FIRST_PAGE = 1

function createQueryState(pageSize: number) {
  return reactive({
    pagination: { pageNo: FIRST_PAGE, pageSize, totalItemCount: 0 },
    tableData: [] as RunDataRow[],
    isTableLoading: false,
    loadError: ''
  })
}

export function useRunDataQuery(options: QueryOptions) {
  const state = createQueryState(options.pageSize)
  let requestSeq = 0

  async function fetchData() {
    const seq = ++requestSeq
    state.isTableLoading = true
    state.loadError = ''
    try {
      const result = await options.queryPage({
        ...options.query.value,
        pageNo: state.pagination.pageNo,
        pageSize: state.pagination.pageSize
      })
      if (seq !== requestSeq) return
      state.tableData = result.data
      state.pagination = {
        ...state.pagination,
        pageNo: result.pageNo,
        totalItemCount: result.totalItemCount
      }
    } catch (error) {
      if (seq !== requestSeq) return
      state.loadError = error instanceof Error ? error.message : String(error)
      state.tableData = []
      state.pagination = { ...state.pagination, totalItemCount: 0 }
      options.onError(error)
    } finally {
      if (seq === requestSeq) {
        state.isTableLoading = false
        options.onSettled()
      }
    }
  }

  watch(
    () => JSON.stringify(options.query.value),
    () => {
      state.pagination = { ...state.pagination, pageNo: FIRST_PAGE }
      void fetchData()
    },
    { immediate: true }
  )
  onScopeDispose(() => {
    requestSeq++
  })
  return { ...toRefs(state), fetchData }
}
