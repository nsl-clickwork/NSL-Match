const fs = require('fs');
const path = require('path');

class Store {
    constructor(filename) {
        this.filepath = path.join(__dirname, '../data', filename);
        if (!fs.existsSync(this.filepath)) {
            fs.writeFileSync(this.filepath, '[]');
        }
    }
    
    readAll() { 
        return JSON.parse(fs.readFileSync(this.filepath, 'utf-8')); 
    }
    
    write(data) { 
        fs.writeFileSync(this.filepath, JSON.stringify(data, null, 2)); 
    }
    
    add(record) {
        const data = this.readAll();
        record.id = record.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        record.createdAt = new Date().toISOString();
        data.push(record);
        this.write(data);
        return record;
    }
    
    findById(id) { 
        return this.readAll().find(r => r.id === id); 
    }
    
    findBy(key, value) { 
        return this.readAll().filter(r => r[key] === value); 
    }
    
    update(id, updates) {
        const data = this.readAll();
        const idx = data.findIndex(r => r.id === id);
        if (idx === -1) throw new Error(`Record ${id} not found`);
        Object.assign(data[idx], updates, { updatedAt: new Date().toISOString() });
        this.write(data);
        return data[idx];
    }

    delete(id) {
        let data = this.readAll();
        data = data.filter(r => r.id !== id);
        this.write(data);
    }
}

module.exports = {
    companies:    new Store('companies.json'),
    preferences:  new Store('preferences.json'),
    decisions:    new Store('decisions.json'),
    slots:        new Store('slots.json'),
    interviews:   new Store('interviews.json')
};
