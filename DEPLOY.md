# 固定網址部署方式

這個專案要有固定網址，必須部署到雲端主機。不要再用 localhost.run 這種臨時 tunnel，因為電腦關機或 tunnel 斷線網址就會失效。

## 建議方式：Render

1. 建立 GitHub repository，放入 `tw-stock-analyzer` 這個資料夾內容。
2. 到 Render 建立 Web Service。
3. Root Directory 設為 `tw-stock-analyzer`。
4. Start Command 使用：

```bash
npm start
```

5. Environment Variables 加：

```bash
ACCESS_TOKEN=stock554828
```

部署完成後會得到固定網址，例如：

```text
https://tw-stock-analyzer.onrender.com/?key=stock554828
```

## 注意

- 免費方案可能會休眠，第一次打開會慢一點，但網址固定。
- 如果要永遠快速回應，要升級付費方案或改用 VPS。
- `ACCESS_TOKEN` 不要寫死在前端，部署時放環境變數。
