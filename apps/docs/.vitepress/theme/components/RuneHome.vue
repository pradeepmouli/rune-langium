<script setup lang="ts">
defineProps<{ slot: 'label' | 'visual' }>();
</script>

<template>
  <div v-if="slot === 'label'" class="rune-hero-label">
    <span class="rune-hero-label__line" />
    <span class="rune-hero-label__text">Built on FINOS Rune DSL</span>
  </div>
  <div v-else-if="slot === 'visual'" class="rune-hero-visual" aria-hidden="true">
    <div class="rune-hero-visual__glow" />
    <div class="rune-hero-visual__grid" />
    <div class="rune-hero-visual__mark">
      <span class="rune-hero-visual__mark-letter">R</span>
    </div>
  </div>
</template>
