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
  vat_registered: number
  logo_path: string | null
}

const { t } = useI18n()
const { data, refresh } = await useFetch<Sender>('/api/sender')
const toast = useToast()
const d = data.value!

const logoSrc = computed(() =>
  data.value?.logo_path ? `/api/sender/logo?v=${data.value.logo_path}` : null
)

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
  foundingYear: d.founding_year ?? undefined as number | undefined,
  vatRegistered: !!d.vat_registered
})

// Re-suggest VAT status when the legal form changes (company is usually registered,
// a private person usually not), but it stays an explicit, overridable choice.
watch(() => form.type, (t) => {
  form.vatRegistered = t === 'company'
})

const typeItems = computed(() => [
  { label: t('customers.typePerson'), value: 'person' },
  { label: t('customers.typeCompany'), value: 'company' }
])

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/sender', { method: 'PUT', body: { ...form } })
    toast.add({ title: t('billing.toastSaved'), color: 'success' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader :title="$t('user.billing')" :description="$t('billing.subtitle')" />

    <UCard>
      <form class="space-y-6" @submit.prevent="save">
        <LogoUpload
          :src="logoSrc"
          upload-url="/api/sender/logo"
          remove-url="/api/sender/logo"
          @changed="refresh"
        />
        <UFormField :label="$t('billing.invoiceAs')">
          <USelect v-model="form.type" :items="typeItems" class="w-48" />
        </UFormField>

        <USwitch
          v-model="form.vatRegistered"
          :label="$t('billing.vatLabel')"
          :description="$t('billing.vatDescription')"
        />

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            :label="form.type === 'company' ? $t('customers.companyName') : $t('common.name')"
            class="sm:col-span-2"
          >
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.street')" class="sm:col-span-2">
            <UInput v-model="form.street" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.zip')">
            <UInput v-model="form.zip" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.city')">
            <UInput v-model="form.city" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.country')">
            <UInput v-model="form.country" class="w-full" />
          </UFormField>
          <UFormField :label="$t('billing.iban')">
            <UInput v-model="form.iban" placeholder="CH.." class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.email')">
            <UInput v-model="form.email" type="email" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.phone')">
            <UInput v-model="form.phone" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.website')" class="sm:col-span-2">
            <UInput v-model="form.website" class="w-full" />
          </UFormField>
        </div>

        <div v-if="form.type === 'company'" class="border-t border-default pt-6">
          <h2 class="font-semibold mb-4">{{ $t('billing.companyDetails') }}</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <UFormField :label="$t('customers.uid')">
              <UInput v-model="form.uid" placeholder="CHE-123.456.789" class="w-full" />
            </UFormField>
            <UFormField :label="$t('customers.mwstNumber')">
              <UInput v-model="form.mwst" placeholder="CHE-123.456.789 MWST" class="w-full" />
            </UFormField>
            <UFormField :label="$t('customers.hrNumber')">
              <UInput v-model="form.hrNumber" class="w-full" />
            </UFormField>
            <UFormField :label="$t('customers.foundingYear')">
              <UInput v-model.number="form.foundingYear" type="number" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">{{ $t('common.save') }}</UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>