#!/usr/bin/env node

const SyntheticDataGenerator = require('./generateSyntheticData');

async function main() {
    try {
        console.log('🎯 PHASE 1.1: SYNTHETIC DATA GENERATION');
        console.log('=====================================\n');
        
        const generator = new SyntheticDataGenerator();
        const results = await generator.generateAll();
        
        console.log('\n📈 GENERATION SUMMARY:');
        console.log('=====================');
        Object.entries(results).forEach(([key, count]) => {
            console.log(`${key.padEnd(20)}: ${count.toLocaleString()} records`);
        });
        
        console.log('\n✅ Phase 1.1 COMPLETED - Ready for Phase 1.2 (ML Service)');
        
    } catch (error) {
        console.error('❌ Error generating synthetic data:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = main;