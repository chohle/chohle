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
  street: string | null
  zip: string | null
  city: string | null
  country: string
  mwst?: string | null
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
const hasQrbill = computed(() => typeof qrbill.value === 'string' && qrbill.value.includes('<svg'))

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
  <div class="min-h-screen bg-white text-black">
    <div class="print:hidden bg-gray-100 border-b border-gray-300 px-6 py-3 flex gap-2">
      <UButton color="neutral" variant="ghost" :to="`/invoices/${id}`">&larr; Back to editor</UButton>
      <UButton icon="i-lucide-printer" @click="printPage">Print / Save as PDF</UButton>
    </div>

    <div class="mx-auto max-w-[210mm] p-12 text-sm">
      <div class="flex justify-between gap-8">
        <div v-if="sender">
          <div class="font-bold text-base">{{ sender.name || 'Your name' }}</div>
          <div>{{ sender.street }}</div>
          <div>{{ [sender.zip, sender.city].filter(Boolean).join(' ') }}</div>
          <div>{{ sender.country }}</div>
          <div v-if="sender.mwst" class="mt-2 text-xs">MWST: {{ sender.mwst }}</div>
        </div>
        <div v-if="customer" class="text-right">
          <div class="font-semibold">{{ customer.name }}</div>
          <div v-if="customer.contact_person">{{ customer.contact_person }}</div>
          <div>{{ customer.street }}</div>
          <div>{{ [customer.zip, customer.city].filter(Boolean).join(' ') }}</div>
          <div>{{ customer.country }}</div>
        </div>
      </div>

      <div class="mt-12">
        <h1 class="text-xl font-bold">Rechnung Nr. {{ invoice.number }}</h1>
        <div v-if="invoice.title" class="text-gray-600">{{ invoice.title }}</div>
        <div class="mt-2 text-xs text-gray-600">
          Rechnungsdatum: {{ dateDe(invoice.issue_date) }} · Zahlbar bis: {{ dateDe(invoice.due_date) }}
        </div>
      </div>

      <table class="w-full mt-8 border-collapse">
        <thead>
          <tr class="border-b-2 border-black text-left">
            <th class="py-1 font-semibold">Bezeichnung</th>
            <th class="py-1 font-semibold text-right">Menge</th>
            <th class="py-1 font-semibold">Einheit</th>
            <th class="py-1 font-semibold text-right">Preis</th>
            <th class="py-1 font-semibold text-right">Betrag</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(i, idx) in items" :key="idx" class="border-b border-gray-300">
            <td class="py-1">{{ i.description }}</td>
            <td class="py-1 text-right">{{ i.quantity }}</td>
            <td class="py-1">{{ i.unit }}</td>
            <td class="py-1 text-right">{{ chf(i.unit_price_rappen) }}</td>
            <td class="py-1 text-right">{{ chf(lineAmount(i)) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex justify-end mt-6">
        <dl class="w-64 space-y-1">
          <div class="flex justify-between">
            <dt>Netto</dt>
            <dd>CHF {{ chf(totals.nettoRappen) }}</dd>
          </div>
          <div v-for="r in totals.mwstByRate" :key="r.rate" class="flex justify-between">
            <dt>MWST {{ r.rate }}%</dt>
            <dd>CHF {{ chf(r.mwstRappen) }}</dd>
          </div>
          <div class="flex justify-between font-bold border-t-2 border-black pt-1">
            <dt>Total</dt>
            <dd>CHF {{ chf(totals.totalRappen) }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="mx-auto max-w-[210mm] mt-8">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="hasQrbill" class="w-full" v-html="qrbill" />
      <p v-else class="px-12 pb-8 text-xs text-gray-500">
        Add a valid IBAN and sender address in Billing to show the Swiss QR-bill.
      </p>
    </div>
  </div>
</template>
