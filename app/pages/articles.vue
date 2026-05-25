<template>
  <div>
    <PageHeader title="Articles" description="Reusable line items shared across all customers." />

    <UCard>
      <ArticleManager list-url="/api/articles" create-url="/api/articles" />
    </UCard>
  </div>
</template>
