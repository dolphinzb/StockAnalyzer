<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isMaximized = ref(false);

const handleMinimize = () => {
  window.electronAPI?.minimize();
};

const handleMaximize = () => {
  window.electronAPI?.maximize();
};

const handleClose = () => {
  window.electronAPI?.close();
};

onMounted(async () => {
  isMaximized.value = await window.electronAPI?.isMaximized() ?? false;
  window.electronAPI?.onMaximized((maximized) => {
    isMaximized.value = maximized;
  });
});
</script>

<template>
  <div class="title-bar">
    <div class="title-bar-drag">
      <span class="title">StockAnalyzer</span>
    </div>
    <div class="window-controls">
      <button class="control-btn minimize" @click="handleMinimize" title="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="5.5" width="8" height="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="control-btn maximize" @click="handleMaximize" :title="isMaximized ? '还原' : '最大化'">
        <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12">
          <rect x="3.5" y="1" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="1" y="3.5" width="6.5" height="6.5" fill="var(--title-bar-bg)" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="control-btn close" @click="handleClose" title="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.2"/>
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background-color: var(--title-bar-bg);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
  user-select: none;
}

.title-bar-drag {
  flex: 1;
  padding-left: 12px;
}

.title {
  font-size: 13px;
  color: var(--text-color);
}

.window-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--hover-bg);
  }

  &.close:hover {
    background-color: #e81123;
    color: white;
  }
}
</style>
