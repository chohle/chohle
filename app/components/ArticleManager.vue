<script setup lang="ts">
interface Article {
  id: number
  name: string
  unit: string
  default_price_rappen: number
  default_mwst: number
}

const props = defineProps<{ listUrl: string, createUrl: string }>()

const { data: articles, refresh } = await useFetch<Article[]>(props.listUrl, { default: () => [] })

function blank() {
  return {
    id: null as number | null,
    name: '',
    unit: '',
    price: undefined as number | undefined,
    mwst: 8.1
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

function openCreate() {
  Object.assign(form, blank())
  open.value = true
}
function openEdit(a: Article) {
  Object.assign(form, {
    id: a.id,
    name: a.name,
    unit: a.unit,
    price: a.default_price_rappen / 100,
    mwst: a.default_mwst
  })
  open.value = true
}

async function save() {
  if (!form.name.trim() || form.price === undefined) return
  saving.value = true
  try {
    const body = { name: form.name, unit: form.unit, price: form.price, mwst: form.mwst }
    if (form.id) {
      await $fetch(`/api/articles/${form.id}`, { method: 'PUT', body })
    } else {
      await $fetch(props.createUrl, { method: 'POST', body })
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  await $fetch(`/api/articles/${id}`, { method: 'DELETE' })
  await refresh()
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
</script>

<template>
  <div>
    <div class="flex justify-end mb-3">
      <UButton size="sm" icon="i-lucide-plus" @click="openCreate">Add article</UButton>
    </div>

    <p v-if="!articles.length" class="text-muted text-sm">No articles yet.</p>
    <table v-else class="w-full text-sm">
      <thead class="text-muted text-left">
        <tr class="border-b border-default">
          <th class="py-2 font-medium">Name</th>
          <th class="py-2 font-medium">Unit</th>
          <th class="py-2 font-medium text-right">Price</th>
          <th class="py-2 font-medium text-right">MWST</th>
          <th class="py-2" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in articles" :key="a.id" class="border-b border-default last:border-0">
          <td class="py-2">{{ a.name }}</td>
          <td class="py-2">{{ a.unit || '-' }}</td>
          <td class="py-2 text-right whitespace-nowrap">CHF {{ chf(a.default_price_rappen) }}</td>
          <td class="py-2 text-right">{{ a.default_mwst }}%</td>
          <td class="py-2 text-right whitespace-nowrap">
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(a)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(a.id)" />
          </td>
        </tr>
      </tbody>
    </table>

    <UModal v-model:open="open" :title="form.id ? 'Edit article' : 'Add article'">
      <template #body>
        <form class="grid grid-cols-2 gap-4" @submit.prevent="save">
          <UFormField label="Name" class="col-span-2">
            <UInput v-model="form.name" placeholder="e.g. Wartungsarbeiten" class="w-full" />
          </UFormField>
          <UFormField label="Unit">
            <UInput v-model="form.unit" placeholder="Stunden, Pauschal, ..." class="w-full" />
          </UFormField>
          <UFormField label="Price (CHF)">
            <UInput v-model.number="form.price" type="number" min="0" step="0.05" class="w-full" />
          </UFormField>
          <UFormField label="MWST %" class="col-span-2">
            <UInput v-model.number="form.mwst" type="number" min="0" step="0.1" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
