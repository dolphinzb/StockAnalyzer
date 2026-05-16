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

  /**
   * 绘制饼图
   * 用于展示资产分布（账户余额 vs 持仓市值）
   * @param data 饼图数据数组，每项包含 label、value、color
   * @param options 绘制选项
   */
  const drawPieChart = (
    data: Array<{ label: string; value: number; color: string }>,
    options: {
      showLabels?: boolean;
      showPercentages?: boolean;
    } = {}
  ) => {
    if (!canvasRef) return;

    const canvas = canvasRef;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 处理高分辨率屏幕
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const {
      showLabels = true,
      showPercentages = true,
    } = options;

    // 获取CSS显示尺寸
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 计算总价值
    const totalValue = data.reduce((sum, item) => sum + item.value, 0);

    if (totalValue === 0 || data.length === 0) {
      // 无数据时显示提示
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', displayWidth / 2, displayHeight / 2);
      return;
    }

    // 计算圆心和半径
    const centerX = displayWidth / 2;
    const centerY = displayHeight / 2;
    const radius = Math.min(centerX, centerY) - 30;

    // 存储扇区信息用于鼠标事件
    const sectors: Array<{
      startAngle: number;
      endAngle: number;
      data: { label: string; value: number; color: string; percentage: number };
    }> = [];

    // 绘制扇区
    let currentStartAngle = -Math.PI / 2; // 从12点钟方向开始
    data.forEach((item) => {
      const percentage = item.value / totalValue;
      const sliceAngle = percentage * Math.PI * 2;
      const currentEndAngle = currentStartAngle + sliceAngle;

      // 绘制扇区
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentStartAngle, currentEndAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();

      // 绘制扇区边框
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 标准化角度到 [0, 2π) 范围并存储
      let normalizedStart = currentStartAngle;
      let normalizedEnd = currentEndAngle;
      if (normalizedStart < 0) normalizedStart += Math.PI * 2;
      if (normalizedEnd < 0) normalizedEnd += Math.PI * 2;

      sectors.push({
        startAngle: normalizedStart,
        endAngle: normalizedEnd,
        data: {
          label: item.label,
          value: item.value,
          color: item.color,
          percentage: percentage * 100,
        },
      });

      // 绘制标签和百分比
      if (showLabels || showPercentages) {
        const midAngle = currentStartAngle + sliceAngle / 2;
        const labelRadius = radius * 0.7;
        const labelX = centerX + Math.cos(midAngle) * labelRadius;
        const labelY = centerY + Math.sin(midAngle) * labelRadius;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showPercentages) {
          const percentText = `${(percentage * 100).toFixed(1)}%`;
          ctx.fillText(percentText, labelX, labelY);
        }
      }

      currentStartAngle = currentEndAngle;
    });

    // 设置饼图鼠标事件
    setupPieChartMouseEvents(canvas, sectors, centerX, centerY, radius);
  };

  /**
   * 设置饼图鼠标事件监听
   * 检测鼠标是否在某个扇区内，更新tooltip信息
   */
  const setupPieChartMouseEvents = (
    canvas: HTMLCanvasElement,
    sectors: Array<{
      startAngle: number;
      endAngle: number;
      data: { label: string; value: number; color: string; percentage: number };
    }>,
    centerX: number,
    centerY: number,
    radius: number
  ) => {
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 计算鼠标相对于圆心的距离和角度
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 如果鼠标在圆外，隐藏tooltip
      if (distance > radius) {
        tooltipInfo.value.visible = false;
        return;
      }

      // 计算鼠标角度（Canvas坐标系，Y向下为正）
      // Math.atan2(dy, dx) 返回 [-π, π]
      // 需要转换到 [0, 2π) 范围以便与扇区角度比较
      let angle = Math.atan2(dy, dx);
      if (angle < 0) {
        angle += Math.PI * 2;
      }

      // 查找鼠标所在的扇区
      let found = false;
      for (const sector of sectors) {
        const startAngle = sector.startAngle;
        const endAngle = sector.endAngle;

        // 调试日志
        console.log('[PieChart] Sector:', sector.data.label, 
          'startAngle:', (startAngle * 180 / Math.PI).toFixed(1), '°',
          'endAngle:', (endAngle * 180 / Math.PI).toFixed(1), '°',
          'mouseAngle:', (angle * 180 / Math.PI).toFixed(1), '°');

        // 判断鼠标角度是否在扇区范围内
        if (startAngle <= endAngle) {
          // 正常情况：扇区不跨越0度线
          if (angle >= startAngle && angle <= endAngle) {
            console.log('[PieChart] Matched sector:', sector.data.label);
            found = true;
            tooltipInfo.value = {
              visible: true,
              x: e.clientX,
              y: e.clientY,
              label: `${sector.data.label}: ¥${sector.data.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sector.data.percentage.toFixed(1)}%)`,
              value: sector.data.value,
            };
            break;
          }
        } else {
          // 扇区跨越0度线（3点钟方向）
          if (angle >= startAngle || angle <= endAngle) {
            console.log('[PieChart] Matched sector (crossing 0):', sector.data.label);
            found = true;
            tooltipInfo.value = {
              visible: true,
              x: e.clientX,
              y: e.clientY,
              label: `${sector.data.label}: ¥${sector.data.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sector.data.percentage.toFixed(1)}%)`,
              value: sector.data.value,
            };
            break;
          }
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
   * 绘制多折线图
   * 用于展示历史资金趋势（账户余额 + 持仓市值）
   * @param data 折线图数据数组，每项包含 month、accountBalance、holdingsValue、totalAssets
   * @param options 绘制选项
   */
  const drawMultiLineChart = (
    data: Array<{
      month: string;
      accountBalance: number;
      holdingsValue: number;
      totalAssets: number;
    }>,
    options: {
      title?: string;
      lineColorBalance?: string;
      lineColorHoldings?: string;
      lineColorTotal?: string;
    } = {}
  ) => {
    if (!canvasRef) return;

    const canvas = canvasRef;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 处理高分辨率屏幕
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const {
      title = '',
      lineColorBalance = '#3b82f6',
      lineColorHoldings = '#f97316',
      lineColorTotal = '#10b981',
    } = options;

    // 获取CSS显示尺寸
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', displayWidth / 2, displayHeight / 2);
      return;
    }

    // 计算绘图区域
    const padding = { top: 40, right: 30, bottom: 60, left: 70 };
    const chartWidth = displayWidth - padding.left - padding.right;
    const chartHeight = displayHeight - padding.top - padding.bottom;

    // 找出所有数据的最大值和最小值用于Y轴缩放
    const allValues = data.flatMap(d => [d.accountBalance, d.holdingsValue, d.totalAssets]);
    const maxValue = Math.max(...allValues, 1);
    const minValue = Math.min(...allValues, 0);

    // Y轴范围（留10%的上下边距）
    const yRange = maxValue - minValue;
    const yMin = Math.max(0, minValue - yRange * 0.1);
    const yMax = maxValue + yRange * 0.1;
    const yScale = chartHeight / (yMax - yMin || 1);

    // 绘制标题
    if (title) {
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(title, padding.left, 20);
    }

    // 绘制网格线和Y轴标签
    const yTicks = 5;
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
      const ratio = i / yTicks;
      const value = yMin + (yMax - yMin) * ratio;
      const y = padding.top + chartHeight * (1 - ratio);

      // 绘制网格线
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(displayWidth - padding.right, y);
      ctx.stroke();

      // 绘制Y轴标签（格式化金额）
      const formattedValue = value >= 10000
        ? `${(value / 10000).toFixed(1)}万`
        : value.toFixed(0);
      ctx.fillText(formattedValue, padding.left - 8, y + 3);
    }

    // 绘制坐标轴
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, displayHeight - padding.bottom);
    ctx.lineTo(displayWidth - padding.right, displayHeight - padding.bottom);
    ctx.stroke();

    // 存储数据点位置用于鼠标事件
    const dataPoints: Array<{
      x: number;
      yBalance: number;
      yHoldings: number;
      yTotal: number;
      data: {
        month: string;
        accountBalance: number;
        holdingsValue: number;
        totalAssets: number;
      };
    }> = [];

    // 计算X轴间距
    const xStep = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;

    // 绘制折线和数据点
    const drawLine = (
      values: number[],
      color: string,
      lineWidth: number = 2
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      values.forEach((value, index) => {
        const x = padding.left + index * xStep;
        const y = padding.top + chartHeight - (value - yMin) * yScale;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    };

    // 绘制数据点
    const drawPoints = (
      values: number[],
      color: string,
      radius: number = 4
    ) => {
      values.forEach((value, index) => {
        const x = padding.left + index * xStep;
        const y = padding.top + chartHeight - (value - yMin) * yScale;

        // 外圈
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 内圈
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    };

    // 提取各系列数据
    const balanceValues = data.map(d => d.accountBalance);
    const holdingsValues = data.map(d => d.holdingsValue);
    const totalValues = data.map(d => d.totalAssets);

    // 绘制持仓市值折线（先画，在底层）
    drawLine(holdingsValues, lineColorHoldings, 2);
    drawPoints(holdingsValues, lineColorHoldings, 4);

    // 绘制账户余额折线（中间层）
    drawLine(balanceValues, lineColorBalance, 2);
    drawPoints(balanceValues, lineColorBalance, 4);

    // 绘制总资产折线（最上层，虚线加粗）
    drawLine(totalValues, lineColorTotal, 2.5);
    drawPoints(totalValues, lineColorTotal, 5);

    // 存储数据点位置
    data.forEach((item, index) => {
      dataPoints.push({
        x: padding.left + index * xStep,
        yBalance: padding.top + chartHeight - (item.accountBalance - yMin) * yScale,
        yHoldings: padding.top + chartHeight - (item.holdingsValue - yMin) * yScale,
        yTotal: padding.top + chartHeight - (item.totalAssets - yMin) * yScale,
        data: item,
      });
    });

    // 绘制X轴标签（月份）
    ctx.fillStyle = '#6b7280';
    const labelInterval = data.length > 24 ? 3 : data.length > 12 ? 2 : 1;
    data.forEach((item, index) => {
      if (index % labelInterval !== 0 && index !== data.length - 1) return;

      const x = padding.left + index * xStep;
      ctx.save();
      ctx.translate(x, displayHeight - padding.bottom + 15);
      ctx.rotate(-Math.PI / 4);
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(item.month, 0, 0);
      ctx.restore();
    });

    // 绘制图例
    const legendY = padding.top - 15;
    // 总资产图例
    ctx.fillStyle = lineColorTotal;
    ctx.fillRect(displayWidth - padding.right - 270, legendY, 12, 12);
    ctx.fillStyle = '#374151';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('总资产', displayWidth - padding.right - 254, legendY + 10);

    // 账户余额图例
    ctx.fillStyle = lineColorBalance;
    ctx.fillRect(displayWidth - padding.right - 180, legendY, 12, 12);
    ctx.fillStyle = '#374151';
    ctx.fillText('账户余额', displayWidth - padding.right - 164, legendY + 10);

    // 持仓市值图例
    ctx.fillStyle = lineColorHoldings;
    ctx.fillRect(displayWidth - padding.right - 90, legendY, 12, 12);
    ctx.fillStyle = '#374151';
    ctx.fillText('持仓市值', displayWidth - padding.right - 74, legendY + 10);

    // 设置鼠标事件
    setupMultiLineMouseEvents(canvas, dataPoints);
  };

  /**
   * 设置多折线图鼠标事件监听
   * 检测鼠标是否在数据点附近，更新tooltip信息
   */
  const setupMultiLineMouseEvents = (
    canvas: HTMLCanvasElement,
    dataPoints: Array<{
      x: number;
      yBalance: number;
      yHoldings: number;
      yTotal: number;
      data: {
        month: string;
        accountBalance: number;
        holdingsValue: number;
        totalAssets: number;
      };
    }>
  ) => {
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 检测阈值（像素）
      const threshold = 8;

      let found = false;
      for (const point of dataPoints) {
        // 检查鼠标是否在账户余额数据点附近
        const distBalance = Math.sqrt(
          (mouseX - point.x) ** 2 + (mouseY - point.yBalance) ** 2
        );
        // 检查鼠标是否在持仓市值数据点附近
        const distHoldings = Math.sqrt(
          (mouseX - point.x) ** 2 + (mouseY - point.yHoldings) ** 2
        );
        // 检查鼠标是否在总资产数据点附近
        const distTotal = Math.sqrt(
          (mouseX - point.x) ** 2 + (mouseY - point.yTotal) ** 2
        );

        if (distBalance <= threshold || distHoldings <= threshold || distTotal <= threshold) {
          const d = point.data;
          tooltipInfo.value = {
            visible: true,
            x: e.clientX,
            y: e.clientY,
            label: `${d.month}\n账户余额: ¥${d.accountBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n持仓市值: ¥${d.holdingsValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n总资产: ¥${d.totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            value: d.totalAssets,
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

  return {
    chartData,
    isDrawing,
    tooltipInfo,
    drawChart,
    drawPieChart,
    drawMultiLineChart,
    resize,
    cleanup,
  };
}
