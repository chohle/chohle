<template>
  <div>
    <UiPageHead :crumb="`${$t('nav.workspace')} / ${$t('nav.articles')}`" :title="$t('nav.articles')" :subtitle="$t('articles.subtitle')" />

    <UiCard>
      <ArticleManager list-url="/api/articles" create-url="/api/articles" />
    </UiCard>
  </div>
</template>
