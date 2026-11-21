export const scenarios = [
  ['unauthorized', '未授权', '页面工具默认开启，登录态尚未授权。'],
  ['synced', '已同步', '已有当前浏览器的快照，最近同步成功。'],
  ['pending', '正在同步', '已建立授权，首轮同步仍在进行。'],
  ['empty', '没有可用会话', '最近同步成功，但可用 Cookie 数为零。'],
  ['partitioned', '仅有分区 Cookie', '可用快照为空，分区排除数量保留在诊断里。'],
  ['failed', '同步失败 · 保留旧快照', '新的读取失败与旧成功快照同时存在。'],
  ['permission', '站点权限已移除', '保留既有授权及旧快照，显示重新授权恢复方向。'],
  ['bridge', '扩展连接不可用', '状态查询失败，保留授权中的上次同步时间。'],
  ['registration', '连接注册缺失', '原生桥接返回明确的未找到注册错误。'],
  ['protocol', '连接组件不兼容', '原生桥接返回协议不兼容错误。'],
  ['unknown-result', '同步结果未知', '已有快照，但没有可核实的最近同步结果。'],
  ['unknown', '连接状态未知', '收到不完整的状态响应，不能表达连接成功。'],
];
export const sites = {
  bilibili: {label: 'bilibili.com', url: 'https://www.bilibili.com/video/BV1xx411c7mD', domain: 'bilibili.com', tools: true},
  youtube: {label: 'youtube.com', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', domain: 'youtube.com', tools: true},
  ordinary: {label: '普通站点 · example.com', url: 'https://example.com/preview', domain: 'example.com', tools: false},
  long: {label: '超长域名', url: 'https://this-is-an-unusually-long-website-name-which-must-stay-readable.example/path', domain: 'this-is-an-unusually-long-website-name-which-must-stay-readable.example', tools: false},
  restricted: {label: '浏览器内部页面', url: 'chrome://newtab/', domain: null, tools: false},
};
