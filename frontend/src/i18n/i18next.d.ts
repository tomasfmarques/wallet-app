// Type-safe translation keys. The Portuguese resources define the canonical
// key shape; any `t('...')` with a missing key becomes a compile error, and
// editors autocomplete keys. Keep pt/ and en/ namespaces in sync.
import 'i18next'
import type { resources } from './index'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['pt']
  }
}
