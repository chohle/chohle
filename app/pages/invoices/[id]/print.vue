<script setup lang="ts">
definePageMeta({ layout: false })

interface Invoice {
  customer_id: number
  number: string
  title: string
  issue_date: string
  due_date: string
}
interface Item {
  description: string
  quantity: number
  unit: string
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}
interface Totals {
  nettoRappen: number
  mwstByRate: { rate: number, mwstRappen: number }[]
  totalRappen: number
}
interface Party {
  type?: string
  name: string
  contact_person?: string | null
  customer_number?: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string
  email?: string | null
  phone?: string | null
  website?: string | null
  mwst?: string | null
  logo_path?: string | null
}

const route = useRoute()
const id = route.params.id as string

const { data } = await useFetch<{ invoice: Invoice, items: Item[], totals: Totals }>(
  `/api/invoices/${id}`
)
const invoice = data.value!.invoice
const items = data.value!.items
const totals = data.value!.totals

const { data: customer } = await useFetch<Party>(`/api/customers/${invoice.customer_id}`)
const { data: sender } = await useFetch<Party>('/api/sender')
const { data: qrbill } = await useFetch<string>(`/api/invoices/${id}/qrbill`, {
  // Read as text (it's SVG markup we inline); 422 (e.g. no IBAN) just shows a hint.
  responseType: 'text',
  ignoreResponseError: true
})

// The printed invoice is a document for the customer, so render it in their
// language regardless of the owner's UI locale. Page controls stay on $t.
const { t, loadLocaleMessages } = useI18n()
const docLocale = customer.value?.language ?? 'en'
await loadLocaleMessages(docLocale)
function td(key: string, named?: Record<string, unknown>) {
  return t(key, named ?? {}, { locale: docLocale })
}
const hasQrbill = computed(() => typeof qrbill.value === 'string' && qrbill.value.includes('<svg'))
const senderLogo = computed(() =>
  sender.value?.logo_path ? `/api/sender/logo?v=${sender.value.logo_path}` : null
)
const senderReturnLine = computed(() => {
  const s = sender.value
  if (!s) return ''
  return [s.name, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
})
const footerLine = computed(() => {
  const s = sender.value
  if (!s) return ''
  return [s.phone, s.email, s.website, s.mwst].filter(Boolean).join(' · ')
})

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function dateDe(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
function lineAmount(i: Item) {
  return lineNetRappen({
    quantity: i.quantity,
    unitPriceRappen: i.unit_price_rappen,
    discountPercent: i.discount_percent,
    mwstPercent: i.mwst_percent
  })
}
function printPage() {
  if (import.meta.client) window.print()
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 text-black">
    <div class="print:hidden bg-white border-b border-gray-300 px-6 py-3 flex gap-2">
      <UButton color="neutral" variant="ghost" :to="`/invoices/${id}`">&larr; {{ $t('invoices.backToEditor') }}</UButton>
      <UButton icon="i-lucide-printer" @click="printPage">{{ $t('invoices.printSave') }}</UButton>
    </div>

    <div
      class="invoice-page mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white text-[11px] leading-relaxed text-black shadow-sm print:shadow-none"
    >
      <div class="flex flex-1 flex-col px-[20mm] pt-[18mm] pb-6">
        <!-- Logo -->
        <div class="mb-16 h-12">
          <img v-if="senderLogo" :src="senderLogo" alt="Logo" class="h-12 object-contain">
          <div v-else class="text-2xl font-bold tracking-tight">{{ sender?.name || 'batze' }}</div>
        </div>

        <!-- Meta block (left) + addresses (right) -->
        <div class="flex justify-between gap-10">
          <div>
            <div class="mb-2 flex items-baseline gap-6">
              <span class="font-bold">{{ td('invoiceDoc.invoice') }}</span>
              <span class="text-gray-500">{{ td('invoiceDoc.page') }}</span>
            </div>
            <table>
              <tbody class="align-top">
                <tr>
                  <td class="pr-4 text-gray-600">{{ td('invoiceDoc.invoiceNo') }}</td>
                  <td>{{ invoice.number }}</td>
                </tr>
                <tr v-if="customer?.customer_number">
                  <td class="pr-4 text-gray-600">{{ td('invoiceDoc.customerNo') }}</td>
                  <td>{{ customer.customer_number }}</td>
                </tr>
                <tr>
                  <td class="pr-4 text-gray-600">{{ td('invoiceDoc.date') }}</td>
                  <td>{{ dateDe(invoice.issue_date) }}</td>
                </tr>
                <tr>
                  <td class="pr-4 text-gray-600">{{ td('invoiceDoc.payableUntil') }}</td>
                  <td>{{ dateDe(invoice.due_date) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="customer" class="w-[80mm]">
            <div v-if="senderReturnLine" class="mb-6 text-[9px] underline">{{ senderReturnLine }}</div>
            <div class="font-semibold">{{ customer.name }}</div>
            <div v-if="customer.contact_person">{{ customer.contact_person }}</div>
            <div>{{ customer.street }}</div>
            <div>{{ [customer.zip, customer.city].filter(Boolean).join(' ') }}</div>
            <div v-if="customer.country && customer.country !== 'CH'">{{ customer.country }}</div>
          </div>
        </div>

        <!-- Subject -->
        <div v-if="invoice.title" class="mt-12 font-semibold">{{ invoice.title }}</div>

        <!-- Line items -->
        <table class="mt-6 w-full border-collapse">
          <thead>
            <tr class="border-y border-black">
              <th class="py-2 pr-3 text-left font-semibold">{{ td('invoiceDoc.description') }}</th>
              <th class="py-2 px-3 text-right font-semibold">{{ td('invoiceDoc.quantity') }}</th>
              <th class="py-2 px-3 text-left font-semibold">{{ td('invoiceDoc.unit') }}</th>
              <th class="py-2 px-3 text-right font-semibold">{{ td('invoiceDoc.price') }}</th>
              <th class="py-2 pl-3 text-right font-semibold">{{ td('invoiceDoc.amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(i, idx) in items" :key="idx" class="align-top">
              <td class="py-2 pr-3">{{ i.description }}</td>
              <td class="py-2 px-3 text-right tabular-nums">{{ i.quantity }}</td>
              <td class="py-2 px-3">{{ i.unit }}</td>
              <td class="py-2 px-3 text-right tabular-nums">{{ chf(i.unit_price_rappen) }}</td>
              <td class="py-2 pl-3 text-right tabular-nums">{{ chf(lineAmount(i)) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals -->
        <div class="mt-4 flex justify-end">
          <table>
            <tbody>
              <tr>
                <td class="py-0.5 pr-12 text-gray-600">{{ td('invoiceDoc.sumInChf') }}</td>
                <td class="py-0.5 text-right tabular-nums">{{ chf(totals.nettoRappen) }}</td>
              </tr>
              <tr v-for="r in totals.mwstByRate" :key="r.rate">
                <td class="py-0.5 pr-12 text-gray-600">{{ td('invoiceDoc.vatLine', { rate: r.rate }) }}</td>
                <td class="py-0.5 text-right tabular-nums">{{ chf(r.mwstRappen) }}</td>
              </tr>
              <tr class="border-t border-black font-bold">
                <td class="py-1.5 pr-12">{{ td('invoiceDoc.invoiceAmountChf') }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ chf(totals.totalRappen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Contact footer, pinned to the bottom of the letter area -->
        <div v-if="footerLine" class="mt-auto pt-10 text-center text-[9px] text-gray-500">
          {{ footerLine }}
        </div>
      </div>

      <!-- Swiss QR-bill (bottom 105mm) -->
      <div v-if="hasQrbill" class="w-full" v-html="qrbill" />
      <p v-else class="px-[20mm] pb-8 text-[10px] text-gray-500">
        {{ $t('invoices.qrHint') }}
      </p>
    </div>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4;
    margin: 0;
  }
}
</style>
