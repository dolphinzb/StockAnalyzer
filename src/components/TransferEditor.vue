<template>
  <Modal
    v-model="isVisible"
    :title="isEdit ? '编辑转账记录' : '新增转账记录'"
    :close-on-overlay-click="false"
    @close="handleClose"
  >
    <form @submit.prevent="handleSubmit" class="transfer-form">
      <!-- 转账类型 -->
      <div class="form-group">
        <label for="type">转账类型</label>
        <select id="type" v-model="formData.type" required class="form-input">
          <option value="IN">转入</option>
          <option value="OUT">转出</option>
        </select>
      </div>

      <!-- 转账金额 -->
      <div class="form-group">
        <label for="amount">转账金额（元）</label>
        <input
          id="amount"
          v-model.number="formData.amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          class="form-input"
          placeholder="请输入金额"
        />
        <span v-if="errors.amount" class="error-text">{{ errors.amount }}</span>
      </div>

      <!-- 转账日期 -->
      <div class="form-group">
        <label for="date">转账日期</label>
        <input
          id="date"
          v-model="formData.transferDate"
          type="date"
          required
          class="form-input"
        />
        <span v-if="errors.date" class="error-text">{{ errors.date }}</span>
      </div>
    </form>

    <!-- 操作按钮 -->
    <template #footer>
      <button type="button" class="btn-cancel" @click="handleClose">
        取消
      </button>
      <button type="submit" class="btn-submit" :disabled="isSubmitting" @click="handleSubmit">
        {{ isSubmitting ? '保存中...' : '保存' }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Modal from './Modal.vue';
import type { TransferRecord } from '../../shared/types';

interface Props {
  modelValue: boolean;
  record?: TransferRecord | null;
}

const props = withDefaults(defineProps<Props>(), {
  record: null,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [data: { transferDate: string; amount: number; type: 'IN' | 'OUT' }];
}>();

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const isEdit = computed(() => !!props.record);

// 表单数据
const formData = ref({
  transferDate: new Date().toISOString().split('T')[0],
  amount: 0,
  type: 'IN' as 'IN' | 'OUT',
});

// 错误信息
const errors = ref({
  amount: '',
  date: '',
});

const isSubmitting = ref(false);

// 监听record变化，填充表单
watch(
  () => props.record,
  (newRecord) => {
    if (newRecord) {
      formData.value = {
        transferDate: newRecord.transferDate,
        amount: newRecord.amount,
        type: newRecord.type,
      };
    } else {
      // 重置为默认值
      formData.value = {
        transferDate: new Date().toISOString().split('T')[0],
        amount: 0,
        type: 'IN',
      };
    }
    // 清除错误
    errors.value = { amount: '', date: '' };
  },
  { immediate: true }
);

// 验证表单
const validateForm = (): boolean => {
  let isValid = true;
  errors.value = { amount: '', date: '' };

  // 验证金额
  if (formData.value.amount <= 0) {
    errors.value.amount = '金额必须大于0';
    isValid = false;
  }

  // 验证日期
  if (!formData.value.transferDate) {
    errors.value.date = '请选择日期';
    isValid = false;
  }

  return isValid;
};

// 提交表单
const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }

  try {
    isSubmitting.value = true;
    await emit('save', { ...formData.value });
    handleClose();
  } catch (error) {
    console.error('Submit error:', error);
  } finally {
    isSubmitting.value = false;
  }
};

// 关闭对话框
const handleClose = () => {
  isVisible.value = false;
  // 清除表单内容
  formData.value = {
    transferDate: new Date().toISOString().split('T')[0],
    amount: 0,
    type: 'IN',
  };
  errors.value = { amount: '', date: '' };
};
</script>

<style scoped lang="scss">
.transfer-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }
}

.form-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
}

.error-text {
  font-size: 12px;
  color: #ef4444;
}

.btn-cancel,
.btn-submit {
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

.btn-submit {
  background-color: #3b82f6;
  color: white;
  border: none;

  &:hover:not(:disabled) {
    background-color: #2563eb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
