## ADDED Requirements

### Requirement: 名录行可跳转到 K 线查看页

页面 SHALL 为每行证券提供「查看K线」操作，点击后 MUST 跳转到 `market-kline` 页面并把该行证券代码作为选中代码，使 K 线查看页自动选股并加载该证券数据。该操作 MUST NOT 触发行情库同步，MUST NOT 修改证券名录或自选股数据。

#### Scenario: 从名录跳转到 K 线查看
- **WHEN** 用户在股票列表某行点击「查看K线」
- **THEN** 系统切换到 `market-kline` 页面，选中代码为该行证券代码，页面加载该证券的默认周期与默认复权 K 线

#### Scenario: 跳转不产生写操作
- **WHEN** 用户点击「查看K线」后返回股票列表
- **THEN** 证券名录与自选股列表均未发生变化，未启动任何同步任务
