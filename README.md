# AI Shopping Scraper

An AI Shopping Assistant that learns to navigate e-commerce sites through synthetic human reasoning rather than captured human behavior.

## 🎯 Project Vision

Generate training data by combining automated scraping with human-like decision logic to train AI agents that can shop efficiently with human-like intent.

## 🏗️ Architecture

```
1. Scraping Engine → Discovers site structure & products
2. Reasoning Engine → Adds human logic to each interaction  
3. Pattern Recognition → Identifies site navigation patterns
4. Training Data Generator → Creates AI-ready flows
5. AI Training Pipeline → Learns from reasoned flows
```

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
src/
├── scraping/          # Web scraping engine
├── reasoning/         # Human reasoning generation
├── patterns/          # Site pattern recognition
├── training/          # Training data generation
├── api/              # API endpoints
└── index.js          # Main application entry

data/                 # Generated training data
logs/                 # Application logs
tests/                # Test files
```

## 🎯 Success Metrics

- Generate 1000+ unique shopping scenarios per day
- Support 20+ major e-commerce sites
- 95% accuracy in product data extraction
- Sub-30 second average site processing time

## 📋 Development Phases

- [x] Phase 1: Foundation setup
- [ ] Phase 2: Reasoning Engine
- [ ] Phase 3: Pattern Recognition
- [ ] Phase 4: Training Data Generation
- [ ] Phase 5: AI Integration
- [ ] Phase 6: Production Readiness