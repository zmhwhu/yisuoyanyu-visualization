# 一蓑烟雨可视化网页

这是“ 一蓑烟雨 ”交互式可视化网页的改进版，已整理为 GitHub Pages 可直接部署的静态站点。

## 本地预览

```powershell
python -m http.server 8000
```

然后打开 `http://127.0.0.1:8000/`。

## 文件说明

- `index.html`: GitHub Pages 入口，来自 `一蓑烟雨_改进版.html`，并清理了浏览器插件注入节点。
- `app_改进版.js`: 改进版交互脚本。
- `data.json`: 原始数据文件。
- `一蓑烟雨_改进版.html`: 改进版原始页面备份。
