'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  theme: 'slate-green',
  lastTargetDir: '',
};

class DataManager {
  constructor() {
    this.dataPath = path.join(__dirname, 'user-data.json');
    this.data = { ...DEFAULT_DATA };
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        this.save();
        return;
      }

      const raw = fs.readFileSync(this.dataPath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        ...DEFAULT_DATA,
        ...parsed,
      };
    } catch (_error) {
      this.data = { ...DEFAULT_DATA };
      this.save();
    }
  }

  save() {
    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  getTheme() {
    return this.data.theme || DEFAULT_DATA.theme;
  }

  setTheme(theme) {
    this.data.theme = theme || DEFAULT_DATA.theme;
    this.save();
  }

  getLastTargetDir() {
    return this.data.lastTargetDir || '';
  }

  setLastTargetDir(targetDir) {
    this.data.lastTargetDir = targetDir || '';
    this.save();
  }
}

module.exports = new DataManager();
