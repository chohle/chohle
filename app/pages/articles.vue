<script setup lang="ts">
const articleRef = ref<{ openCreate: () => void }>()
</script>

<template>
  <div>
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.articles')}`"
      :title="$t('nav.articles')"
      :subtitle="$t('articles.subtitle')"
    >
      <template #actions>
        <button class="ed-btn-primary" @click="articleRef?.openCreate()">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('articles.add') }}
        </button>
      </template>
    </UiPageHead>

    <UiCard>
      <ArticleManager
        ref="articleRef"
        list-url="/api/articles"
        create-url="/api/articles"
        headless
      />
    </UiCard>
  </div>
</template>
