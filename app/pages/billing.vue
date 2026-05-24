<script setup lang="ts">
interface Sender {
  type: 'person' | 'company'
  name: string
  street: string
  zip: string
  city: string
  country: string
  email: string
  phone: string
  website: string
  iban: string
  uid: string
  mwst: string
  hr_number: string
  founding_year: number | null
}

const { data } = await useFetch<Sender>('/api/sender')
const toast = useToast()
const d = data.value!

const form = reactive({
  type: d.type,
  name: d.name,
  street: d.street,
  zip: d.zip,
  city: d.city,
  country: d.country,
  email: d.email,
  phone: d.phone,
  website: d.website,
  iban: d.iban,
  uid: d.uid,
  mwst: d.mwst,
  hrNumber: d.hr_number,
  foundingYear: d.founding_year ?? undefined as number | undefined
})

const typeItems = [
  { label: 'Private person', value: 'person' },
  { label: 'Company', value: 'company' }
]

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/sender', { method: 'PUT', body: { ...form } })
    toast.add({ title: 'Billing details saved', color: 'success' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-2xl font-bold">Billing</h1>
    <p class="text-muted mt-1">Who appears as the sender on your invoices and QR-bill.</p>

    <UCard class="mt-6">
      <form class="space-y-6" @submit.prevent="save">
        <UFormField label="You invoice as">
          <USelect v-model="form.type" :items="typeItems" class="w-48" />
        </UFormField>

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            :label="form.type === 'company' ? 'Company name' : 'Name'"
            class="sm:col-span-2"
          >
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Street" class="sm:col-span-2">
            <UInput v-model="form.street" class="w-full" />
          </UFormField>
          <UFormField label="ZIP">
            <UInput v-model="form.zip" class="w-full" />
          </UFormField>
          <UFormField label="City">
            <UInput v-model="form.city" class="w-full" />
          </UFormField>
          <UFormField label="Country">
            <UInput v-model="form.country" class="w-full" />
          </UFormField>
          <UFormField label="IBAN">
            <UInput v-model="form.iban" placeholder="CH.." class="w-full" />
          </UFormField>
          <UFormField label="Email">
            <UInput v-model="form.email" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Phone">
            <UInput v-model="form.phone" class="w-full" />
          </UFormField>
          <UFormField label="Website" class="sm:col-span-2">
            <UInput v-model="form.website" class="w-full" />
          </UFormField>
        </div>

        <div v-if="form.type === 'company'" class="border-t border-default pt-6">
          <h2 class="font-semibold mb-4">Company details</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <UFormField label="UID">
              <UInput v-model="form.uid" placeholder="CHE-123.456.789" class="w-full" />
            </UFormField>
            <UFormField label="MWST number">
              <UInput v-model="form.mwst" placeholder="CHE-123.456.789 MWST" class="w-full" />
            </UFormField>
            <UFormField label="HR number">
              <UInput v-model="form.hrNumber" class="w-full" />
            </UFormField>
            <UFormField label="Founding year">
              <UInput v-model.number="form.foundingYear" type="number" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">Save</UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>