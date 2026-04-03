<script setup lang="ts">
import TitleBar from './components/TitleBar.vue';
</script>

<template>
  <div class="app">
    <TitleBar />
    <main class="main-content">
      <h1>StockAnalyzer</h1>
      <p>基于 Electron + Vue3 + TypeScript 的股票分析桌面应用</p>
    </main>
  </div>
</template>

<style scoped lang="scss">
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;

  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  p {
    color: var(--text-secondary);
  }
}
</style>
