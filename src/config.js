const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ConfigLoader {
  constructor() {
    this.configPath = path.join(__dirname, '../config.yml');
    this.config = this.loadConfig();
  }

  // 加载 YAML 配置
  loadConfig() {
    try {
      const configFile = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(configFile);
      
      // 解析路径为绝对路径
      this.resolvePaths(config);
      
      return config;
    } catch (error) {
      console.error('加载配置文件失败:', error.message);
      return this.getDefaultConfig();
    }
  }

  // 解析路径为绝对路径
  resolvePaths(config) {
    const baseDir = path.join(__dirname, '..');
    
    if (config.paths) {
      Object.keys(config.paths).forEach(key => {
        if (typeof config.paths[key] === 'string' && config.paths[key].startsWith('./')) {
          config.paths[key] = path.join(baseDir, config.paths[key].substring(2));
        }
      });
    }
  }

  // 默认配置（备用）
  getDefaultConfig() {
    return {
      site: {
        title: 'My Static Site',
        description: 'A website generated with static site generator',
        author: 'Your Name',
        baseUrl: 'http://localhost:3000'
      },
      paths: {
        content: path.join(__dirname, '../content'),
        templates: path.join(__dirname, '../templates'),
        output: path.join(__dirname, '../output'),
        static: path.join(__dirname, '../static')
      },
      markdown: {
        breaks: true,
        gfm: true,
        headerIds: true
      },
      server: {
        port: 3000,
        open: true
      }
    };
  }

  // 获取配置
  getConfig() {
    return this.config;
  }

  // 重新加载配置（用于开发模式）
  reload() {
    this.config = this.loadConfig();
    return this.config;
  }
}

module.exports = new ConfigLoader().getConfig();