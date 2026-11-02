<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown, sanitised by renderMarkdown() -->
  <div v-html="html" />
</template>

<script lang="ts" setup>
import { useMarkdownHtml } from './useMarkdownHtml'

const props = defineProps<{
  content: string
}>()

const html = useMarkdownHtml(() => props.content)
</script>
