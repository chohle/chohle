<template>
  <div class="max-w-3xl">
    <h1 class="text-2xl font-bold">Articles</h1>
    <p class="text-muted mt-1">Reusable line items shared across all customers.</p>

    <UCard class="mt-6">
      <ArticleManager list-url="/api/articles" create-url="/api/articles" />
    </UCard>
  </div>
</template>
