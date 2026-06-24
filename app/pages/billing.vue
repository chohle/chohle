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
const { data, refresh, error } = await useFetch<Sender>('/api/sender')
const toast = useToast()
const d = data.value ?? ({} as Sender)

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
  foundingYear: d.founding_year ?? (undefined as number | undefined),
  vatRegistered: !!d.vat_registered
})

watch(
  () => form.type,
  (t) => {
    form.vatRegistered = t === 'company'
  }
)

const typeItems = computed(() => [
  { label: t('customers.typePerson'), value: 'person' },
  { label: t('customers.typeCompany'), value: 'company' }
])

// Basic RFC-ish check — good enough to catch typos like "aadsf" without
// rejecting valid edge cases. Server is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(state: typeof form) {
  const errors: { name: string; message: string }[] = []
  if (!state.name.trim()) errors.push({ name: 'name', message: t('validation.required') })
  if (!state.email.trim()) errors.push({ name: 'email', message: t('validation.required') })
  else if (!EMAIL_RE.test(state.email.trim()))
    errors.push({ name: 'email', message: t('validation.email') })
  if (!state.iban.trim()) errors.push({ name: 'iban', message: t('validation.required') })
  return errors
}

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
  <div class="page-billing">
    <UiPageHead
      :crumb="`${$t('nav.system')} / ${$t('user.billing')}`"
      :title="$t('user.billing')"
      :subtitle="$t('billing.subtitle')"
    />

    <UiCard>
      <FetchError v-if="error" :bordered="false" @retry="refresh()" />
      <UForm
        v-else
        :state="form"
        :validate="validate"
        :validate-on="['input', 'blur']"
        novalidate
        class="page-billing__form"
        @submit="save"
      >
        <LogoUpload
          :src="logoSrc"
          upload-url="/api/sender/logo"
          remove-url="/api/sender/logo"
          accept="image/png"
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

        <h3 class="eyebrow">{{ $t('billing.businessDetails') }}</h3>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="name"
            :label="form.type === 'company' ? $t('customers.companyName') : $t('common.name')"
            class="sm:col-span-2"
          >
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField :label="$t('customers.street')" class="sm:col-span-2"
            ><UInput v-model="form.street" class="w-full"
          /></UFormField>
          <UFormField :label="$t('customers.zip')"
            ><UInput v-model="form.zip" class="w-full"
          /></UFormField>
          <UFormField :label="$t('customers.city')"
            ><UInput v-model="form.city" class="w-full"
          /></UFormField>
          <UFormField :label="$t('customers.country')"
            ><UInput v-model="form.country" class="w-full"
          /></UFormField>
          <UFormField name="iban" :label="$t('billing.iban')"
            ><UInput v-model="form.iban" class="w-full"
          /></UFormField>
          <UFormField name="email" :label="$t('customers.email')"
            ><UInput v-model="form.email" inputmode="email" autocomplete="email" class="w-full"
          /></UFormField>
          <UFormField :label="$t('customers.phone')"
            ><UInput v-model="form.phone" class="w-full"
          /></UFormField>
          <UFormField :label="$t('customers.website')" class="sm:col-span-2"
            ><UInput v-model="form.website" class="w-full"
          /></UFormField>
        </div>

        <template v-if="form.type === 'company'">
          <h3 class="eyebrow">{{ $t('billing.companyDetails') }}</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="$t('customers.uid')"
              ><UInput v-model="form.uid" class="w-full"
            /></UFormField>
            <UFormField :label="$t('customers.mwstNumber')"
              ><UInput v-model="form.mwst" class="w-full"
            /></UFormField>
            <UFormField :label="$t('customers.hrNumber')"
              ><UInput v-model="form.hrNumber" class="w-full"
            /></UFormField>
            <UFormField :label="$t('customers.foundingYear')"
              ><UInput v-model.number="form.foundingYear" type="number" class="w-full"
            /></UFormField>
          </div>
        </template>

        <div class="page-billing__foot">
          <button type="submit" class="ed-btn-primary" :disabled="saving">
            {{ $t('common.save') }}
          </button>
        </div>
      </UForm>
    </UiCard>
  </div>
</template>
