<template>
  <div>
    <PageHeader :title="$t('nav.articles')" :description="$t('articles.subtitle')" />

    <UCard>
      <ArticleManager list-url="/api/articles" create-url="/api/articles" />
    </UCard>
  </div>
</template>
