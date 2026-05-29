<template>
  <div>
    <UiPageHead crumb="Workspace / Articles" :title="$t('nav.articles')" :subtitle="$t('articles.subtitle')" />

    <UiCard>
      <ArticleManager list-url="/api/articles" create-url="/api/articles" />
    </UiCard>
  </div>
</template>
