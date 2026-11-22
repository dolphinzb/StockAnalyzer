<template>
  <div class="fund-management-view">
    <!-- Tab导航 -->
    <div class="tab-navigation">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'statistics' }"
        @click="activeTab = 'statistics'"
      >
        资金统计
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'transfers' }"
        @click="activeTab = 'transfers'"
      >
        资金明细
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'profit' }"
        @click="activeTab = 'profit'"
      >
        盈亏统计
      </button>
    </div>

    <!-- 资金统计标签页 -->
    <div v-if="activeTab === 'statistics'" class="tab-content">
      <FundStatistics />
    </div>

    <!-- 资金明细标签页 -->
    <div v-else-if="activeTab === 'transfers'" class="tab-content">
      <TransferRecordList
        @add="handleAddTransfer"
        @edit="handleEditTransfer"
        @delete="handleDeleteTransfer"
      />
    </div>

    <!-- 盈亏统计标签页 -->
    <div v-else-if="activeTab === 'profit'" class="tab-content">
      <ProfitStatistics />
    </div>

    <!-- 资金明细编辑对话框 -->
    <TransferEditor
      v-model="showEditor"
      :record="editingRecord"
      @save="handleSaveTransfer"
    />

    <!-- 删除确认对话框 -->
    <Modal
      v-model="showDeleteConfirm"
      title="确认删除"
      :close-on-overlay-click="false"
    >
      <p>确定要删除这条资金明细吗？此操作不可恢复。</p>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteConfirm = false">
          取消
        </button>
        <button class="btn btn-danger" @click="confirmDelete">
          删除
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TransferRecord } from '../../shared/types';
import FundStatistics from '../components/FundStatistics.vue';
import Modal from '../components/Modal.vue';
import ProfitStatistics from '../components/ProfitStatistics.vue';
import TransferEditor from '../components/TransferEditor.vue';
import TransferRecordList from '../components/TransferRecordList.vue';
import { useFundManagementStore } from '../stores/fundManagement';

const activeTab = ref('statistics');
const showEditor = ref(false);
const editingRecord = ref<TransferRecord | null>(null);
const showDeleteConfirm = ref(false);
const deletingRecord = ref<TransferRecord | null>(null);

const store = useFundManagementStore();

// 新增资金明细
const handleAddTransfer = () => {
  editingRecord.value = null;
  showEditor.value = true;
};

// 编辑资金明细
const handleEditTransfer = (record: TransferRecord) => {
  editingRecord.value = record;
  showEditor.value = true;
};

// 保存资金明细（新增或更新）
const handleSaveTransfer = async (data: { transferDate: string; amount: number; type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST'; accountBalance?: number }) => {
  try {
    if (editingRecord.value) {
      // 更新
      await store.updateTransferRecord(editingRecord.value.id, data);
    } else {
      // 新增
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { accountBalance, ...newRecordData } = data;
      await store.addTransferRecord(newRecordData as any);
    }
  } catch (error) {
    console.error('Save error:', error);
  }
};

// 删除资金明细
const handleDeleteTransfer = (record: TransferRecord) => {
  deletingRecord.value = record;
  showDeleteConfirm.value = true;
};

// 确认删除
const confirmDelete = async () => {
  if (!deletingRecord.value) return;

  try {
    await store.deleteTransferRecord(deletingRecord.value.id);
    showDeleteConfirm.value = false;
    deletingRecord.value = null;
  } catch (error) {
    console.error('Delete error:', error);
  }
};
</script>

<style scoped lang="scss">
// 带标签页的页面骨架：标签栏需要贴边，因此根容器不加内边距，内边距由各标签内容自己提供
.fund-management-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-navigation {
  display: flex;
  background-color: var(--bg-secondary);
  border-bottom: 2px solid var(--border-color);
}

.tab-button {
  padding: var(--space-3) var(--space-5);
  margin-bottom: -2px;
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background-color: var(--bg-tertiary);
  }

  &.active {
    color: var(--color-primary);
    background-color: var(--bg-primary);
    border-bottom-color: var(--color-primary);
  }
}

.tab-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
}

.placeholder-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: var(--font-size-md);
  color: var(--text-secondary);
}
</style>
