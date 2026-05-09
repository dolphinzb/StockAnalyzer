import { ref } from 'vue';

/** Tooltip 信息 */
export interface TooltipInfo {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  value: number;
}

/**
 * Canvas 柱状图绘制 Composable
 * 参考 useKlineChart 实现
 */
export function useProfitChart(canvasRef: HTMLCanvasElement | null) {
  /** 图表数据 */
  const chartData = ref<Array<{ label: string; value: number }>>([]);
  /** 是否正在绘制 */
  const isDrawing = ref(false);
  /** Tooltip 信息 */
  const tooltipInfo = ref<TooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    label: '',
    value: 0,
  });

  /**
   * 绘制柱状图
   * @param data 图表数据数组
   * @param options 绘制选项
   */
  const drawChart = (
    data: Array<{ label: string; value: number }>,
    options: {
      title?: string;
      colorPositive?: string;
      colorNegative?: string;
    } = {}
  ) => {
    if (!canvasRef) return;

    const canvas = canvasRef;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 处理高分辨率屏幕
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // 设置Canvas的实际像素尺寸（考虑设备像素比）
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // 缩放context以匹配CSS尺寸
    ctx.scale(dpr, dpr);

    isDrawing.value = true;
    chartData.value = data;

    const {
      title = '',
      colorPositive = '#ef4444',
      colorNegative = '#10b981',
    } = options;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) {
      // 无数据时显示提示
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', canvas.width / 2, canvas.height / 2);
      isDrawing.value = false;
      return;
    }

    // 获取CSS显示尺寸（未缩放的尺寸）
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // 计算绘图区域（使用CSS尺寸）
    // 增加右侧padding以容纳旋转的X轴标签
    const padding = { top: 40, right: 30, bottom: 60, left: 60 };
    const chartWidth = displayWidth - padding.left - padding.right;
    const chartHeight = displayHeight - padding.top - padding.bottom;
    
    // 找出最大值用于缩放
    const maxValue = Math.max(...data.map(d => Math.abs(d.value)), 1);
    const zeroY = padding.top + chartHeight / 2; // X轴位置（中间）

    // 绘制标题
    if (title) {
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(title, padding.left, 20);
    }

    // 绘制X轴（零线）
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(displayWidth - padding.right, zeroY);
    ctx.stroke();

    // 绘制Y轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, displayHeight - padding.bottom);
    ctx.stroke();

    // 绘制右侧边界线
    ctx.beginPath();
    ctx.moveTo(displayWidth - padding.right, padding.top);
    ctx.lineTo(displayWidth - padding.right, displayHeight - padding.bottom);
    ctx.stroke();

    // 绘制顶部边框线
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(displayWidth - padding.right, padding.top);
    ctx.stroke();

    // 绘制底部边框线
    ctx.beginPath();
    ctx.moveTo(padding.left, displayHeight - padding.bottom);
    ctx.lineTo(displayWidth - padding.right, displayHeight - padding.bottom);
    ctx.stroke();

    // 计算柱子宽度
    // 根据数据量动态调整柱子宽度和间距
    const maxBarWidth = 30; // 最大柱子宽度
    const minBarWidth = 8;  // 最小柱子宽度
    const spacing = data.length > 12 ? 2 : 4; // 数据多时间距减小
    
    // 计算理想柱子宽度
    let barWidth = chartWidth / data.length - spacing;
    
    // 限制柱子宽度范围
    barWidth = Math.max(minBarWidth, Math.min(maxBarWidth, barWidth));

    // 绘制Y轴刻度标签
    const yTicks = 5;
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
      const ratio = i / yTicks;
      const value = (maxValue * 2 * ratio - maxValue).toFixed(0);
      const y = padding.top + chartHeight * (1 - ratio);
      
      // 绘制刻度线
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(padding.left - 5, y);
      ctx.lineTo(padding.left, y);
      ctx.stroke();
      
      // 绘制标签
      ctx.fillText(value, padding.left - 8, y + 3);
    }

    // 存储柱子位置用于鼠标悬停检测
    const barPositions: Array<{ x: number; y: number; width: number; height: number; data: { label: string; value: number } }> = [];

    // 绘制柱子
    data.forEach((item, index) => {
      const x = padding.left + index * (barWidth + spacing) + spacing / 2;
      const value = item.value;
      
      // 计算柱子高度
      const barHeight = (Math.abs(value) / maxValue) * (chartHeight / 2);
      
      // 确定柱子颜色
      const color = value >= 0 ? colorPositive : colorNegative;
      
      // 计算柱子Y坐标（盈利在X轴上方，亏损在X轴下方）
      let y: number;
      if (value >= 0) {
        y = zeroY - barHeight;
      } else {
        y = zeroY;
      }

      // 绘制柱子
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth, barHeight);

      // 存储柱子位置
      barPositions.push({ x, y, width: barWidth, height: barHeight, data: item });

      // 绘制X轴标签（年份或月份）
      ctx.save();
      ctx.translate(x + barWidth / 2, displayHeight - padding.bottom + 15);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#6b7280';
      
      // 根据数据量调整字体大小
      const fontSize = data.length > 12 ? 9 : 10;
      ctx.font = `${fontSize}px sans-serif`;
      
      ctx.textAlign = 'right';
      ctx.fillText(item.label, 0, 0);
      ctx.restore();
    });

    // 设置鼠标事件监听
    setupMouseEvents(canvas, barPositions);

    isDrawing.value = false;
  };

  /**
   * 设置鼠标事件监听
   */
  const setupMouseEvents = (
    canvas: HTMLCanvasElement,
    barPositions: Array<{ x: number; y: number; width: number; height: number; data: { label: string; value: number } }>
  ) => {
    // 移除旧的事件监听器
    canvas.onmousemove = null;
    canvas.onmouseleave = null;

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      
      // 获取鼠标在Canvas中的CSS坐标（不需要乘以dpr，因为barPositions存储的是CSS尺寸）
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 检查鼠标是否在某个柱子上
      let found = false;
      for (const bar of barPositions) {
        if (
          mouseX >= bar.x &&
          mouseX <= bar.x + bar.width &&
          mouseY >= bar.y &&
          mouseY <= bar.y + bar.height
        ) {
          tooltipInfo.value = {
            visible: true,
            x: e.clientX,
            y: e.clientY,
            label: bar.data.label,
            value: bar.data.value,
          };
          found = true;
          break;
        }
      }

      if (!found) {
        tooltipInfo.value.visible = false;
      }
    };

    canvas.onmouseleave = () => {
      tooltipInfo.value.visible = false;
    };
  };

  /**
   * 调整画布大小
   */
  const resize = () => {
    if (!canvasRef) return;
    
    const canvas = canvasRef;
    const parent = canvas.parentElement;
    if (!parent) return;

    // 使用requestAnimationFrame确保在下一帧执行，此时DOM已更新
    requestAnimationFrame(() => {
      // 处理高分辨率屏幕
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      
      // 从CSS样式中读取Canvas高度
      const cssHeight = parseFloat(canvas.style.height) || 250;
      
      // 设置Canvas的实际像素尺寸（考虑设备像素比）
      canvas.width = rect.width * dpr;
      canvas.height = cssHeight * dpr; // 使用CSS中设置的高度
      
      // 设置CSS显示尺寸
      canvas.style.width = rect.width + 'px';
      canvas.style.height = cssHeight + 'px';

      // 重新绘制
      if (chartData.value.length > 0) {
        drawChart(chartData.value);
      }
    });
  };

  /**
   * 清理资源
   */
  const cleanup = () => {
    if (canvasRef) {
      canvasRef.onmousemove = null;
      canvasRef.onmouseleave = null;
    }
    chartData.value = [];
    isDrawing.value = false;
    tooltipInfo.value.visible = false;
  };

  return {
    chartData,
    isDrawing,
    tooltipInfo,
    drawChart,
    resize,
    cleanup,
  };
}
