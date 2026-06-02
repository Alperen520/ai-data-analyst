# AI Data Analyst

> 🇹🇷 Türkçe açıklama aşağıda · 🇬🇧 English description below

---

## 🇹🇷 Türkçe

Anthropic Claude API'sini kullanarak veri analizi yapmayı amaçlayan, **Vite** ve **TypeScript** ile geliştirilmiş bir web uygulaması.

### Özellikler
- ⚡ Vite ile hızlı geliştirme ortamı (HMR)
- 🔷 TypeScript ile tip güvenliği
- 🤖 Anthropic Claude API entegrasyonu

### Gereksinimler
- [Node.js](https://nodejs.org/) (18 veya üzeri)
- Bir [Anthropic API anahtarı](https://console.anthropic.com/settings/keys)

### Kurulum
```bash
# Bağımlılıkları yükle
npm install

# Ortam değişkenleri dosyasını oluştur
cp .env.example .env
```
Ardından `.env` dosyasını açıp kendi API anahtarınızı girin:
```
VITE_ANTHROPIC_API_KEY=buraya-api-anahtarınız
```

### Çalıştırma
```bash
# Geliştirme sunucusunu başlat
npm run dev

# Üretim için derle
npm run build

# Derlenmiş sürümü önizle
npm run preview
```

### Güvenlik Notu
`.env` dosyası `.gitignore` ile hariç tutulmuştur; API anahtarınızı **asla** sürüm kontrolüne göndermeyin.

---

## 🇬🇧 English

A web application built with **Vite** and **TypeScript** that aims to perform data analysis using the Anthropic Claude API.

### Features
- ⚡ Fast development environment with Vite (HMR)
- 🔷 Type safety with TypeScript
- 🤖 Anthropic Claude API integration

### Requirements
- [Node.js](https://nodejs.org/) (version 18 or higher)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

### Setup
```bash
# Install dependencies
npm install

# Create the environment file
cp .env.example .env
```
Then open the `.env` file and add your own API key:
```
VITE_ANTHROPIC_API_KEY=your-api-key-here
```

### Usage
```bash
# Start the development server
npm run dev

# Build for production
npm run build

# Preview the built version
npm run preview
```

### Security Note
The `.env` file is excluded via `.gitignore`; **never** commit your API key to version control.
