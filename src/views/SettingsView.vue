<script setup lang="ts">
defineOptions({
  name: 'SettingsView'
})
</script>

<template>
  <div class="settings-view">
    <h2>设置</h2>
    <p class="placeholder-text">占位页面 - 待后续功能实现</p>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  padding: 1rem;

  h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .placeholder-text {
    color: var(--text-secondary);
  }
}
</style>
