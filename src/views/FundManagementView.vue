<template>
  <div class="fund-management-view">
    <!-- Tab导航 -->
    <div class="tab-navigation">
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
        盈利统计
      </button>
    </div>

    <!-- 资金明细标签页 -->
    <div v-if="activeTab === 'transfers'" class="tab-content">
      <TransferRecordList
        @add="handleAddTransfer"
        @edit="handleEditTransfer"
        @delete="handleDeleteTransfer"
      />
    </div>

    <!-- 盈利统计标签页 -->
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
        <button class="btn-cancel" @click="showDeleteConfirm = false">
          取消
        </button>
        <button class="btn-delete-confirm" @click="confirmDelete">
          删除
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TransferRecordList from '../components/TransferRecordList.vue';
import TransferEditor from '../components/TransferEditor.vue';
import ProfitStatistics from '../components/ProfitStatistics.vue';
import Modal from '../components/Modal.vue';
import { useFundManagementStore } from '../stores/fundManagement';
import type { TransferRecord } from '../../shared/types';

const activeTab = ref('transfers');
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
.fund-management-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-navigation {
  display: flex;
  border-bottom: 2px solid #e5e7eb;
  background-color: #f9fafb;
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;

  &:hover {
    color: #111827;
    background-color: #f3f4f6;
  }

  &.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
    background-color: white;
  }
}

.tab-content {
  flex: 1;
  overflow: hidden;
}

.placeholder-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7280;
  font-size: 16px;
}

.btn-cancel,
.btn-delete-confirm {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background-color: white;
  color: #6b7280;
  border: 1px solid #d1d5db;

  &:hover {
    background-color: #f9fafb;
    border-color: #9ca3af;
  }
}

.btn-delete-confirm {
  background-color: #ef4444;
  color: white;
  border: none;

  &:hover {
    background-color: #dc2626;
  }
}
</style>
