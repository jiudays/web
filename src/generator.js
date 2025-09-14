const fs = require('fs');
const path = require('path');
const marked = require('marked');
const ejs = require('ejs');
const config = require('./config');

// 配置 marked
marked.setOptions(config.markdown);

class StaticSiteGenerator {
  constructor() {
    this.watchMode = process.argv.includes('--watch');
    this.serveMode = process.argv.includes('--serve');
    this.config = config;
    this.validatePaths();
  }

  // 验证路径
  validatePaths() {
    const requiredPaths = ['content', 'templates', 'static', 'output'];
    
    requiredPaths.forEach(pathType => {
      const dirPath = this.config.paths[pathType];
      if (!fs.existsSync(dirPath)) {
        console.log('Creating directory:', dirPath);
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  // 解析 Markdown 文件
  parseMarkdownFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const filename = path.basename(filePath, '.md');
      
      const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
      const match = content.match(frontMatterRegex);
      
      let metadata = {};
      let markdownContent = content;
      
      if (match) {
        try {
          const yaml = require('js-yaml');
          metadata = yaml.load(match[1]) || {};
          markdownContent = match[2];
        } catch (error) {
          console.warn('Front matter parsing failed:', error.message);
        }
      }
      
      return {
        filename: filename,
        metadata: {
          title: metadata.title || this.formatTitle(filename),
          date: metadata.date || new Date().toISOString().split('T')[0],
          layout: metadata.layout || 'base',
          ...metadata
        },
        content: marked.parse(markdownContent),
        url: this.generateUrl(filename)
      };
    } catch (error) {
      console.error('Error reading file:', filePath, error.message);
      return null;
    }
  }

  // 格式化标题
  formatTitle(filename) {
    return filename
      .split('-')
      .map(function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  // 生成 URL
  generateUrl(filename) {
    if (filename === 'index') return '/';
    return '/' + filename + '/';
  }

  // 渲染模板
  renderTemplate(templateName, data) {
    const templatePath = path.join(
      this.config.paths.templates, 
      templateName + '.ejs'
    );
    
    try {
      const template = fs.readFileSync(templatePath, 'utf8');
      
      return ejs.render(template, {
        site: this.config.site,
        page: data,
        navigation: this.config.navigation || [],
        social: this.config.social || [],
        currentYear: new Date().getFullYear(),
        config: this.config,
        custom: this.config.custom || {}
      });
    } catch (error) {
      console.error('Render template failed (' + templateName + '):', error.message);
      return '<h1>Template Render Error</h1><p>' + error.message + '</p>';
    }
  }

  // 生成单个页面
  generatePage(markdownFile) {
    try {
      const pageData = this.parseMarkdownFile(markdownFile);
      if (!pageData) return;
      
      const templateName = pageData.metadata.layout;
      const htmlContent = this.renderTemplate(templateName, pageData);
      
      const outputFilename = pageData.filename === 'index' ? 
        'index.html' : pageData.filename + '/index.html';
      
      const outputPath = path.join(this.config.paths.output, outputFilename);
      
      // 确保目录存在
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, htmlContent);
      console.log('Build Successful : ' + outputFilename);
      
    } catch (error) {
      console.error('Build Failed : (' + markdownFile + '):', error.message);
    }
  }

  // 复制静态文件
  copyStaticFiles() {
    try {
      if (!fs.existsSync(this.config.paths.static)) {
        console.log('Static directory does not exist, creating...');
        fs.mkdirSync(this.config.paths.static, { recursive: true });
        return;
      }
      
      const copyItem = (src, dest) => {
        if (fs.existsSync(src)) {
          const stat = fs.statSync(src);
          
          if (stat.isDirectory()) {
            if (!fs.existsSync(dest)) {
              fs.mkdirSync(dest, { recursive: true });
            }
            
            const items = fs.readdirSync(src);
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item !== '.git') {
                copyItem(
                  path.join(src, item),
                  path.join(dest, item)
                );
              }
            }
          } else {
            fs.copyFileSync(src, dest);
          }
        }
      };
      
      copyItem(this.config.paths.static, this.config.paths.output);
      console.log('Static files copied successfully');
      
    } catch (error) {
      console.error('Error copying static files:', error.message);
    }
  }

  // 清理输出目录
  cleanOutput() {
    try {
      if (fs.existsSync(this.config.paths.output)) {
        const items = fs.readdirSync(this.config.paths.output);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item !== '.git') {
            const itemPath = path.join(this.config.paths.output, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
              fs.rmSync(itemPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(itemPath);
            }
          }
        }
        console.log('Clear Old Files Successful');
      }
    } catch (error) {
      console.error('Error cleaning output:', error.message);
    }
  }

  // 生成所有页面
  generateAllPages() {
    console.log('Building...');
    
    this.cleanOutput();
    
    // 创建输出目录
    if (!fs.existsSync(this.config.paths.output)) {
      fs.mkdirSync(this.config.paths.output, { recursive: true });
    }
    
    // 处理所有 Markdown 文件
    try {
      const files = fs.readdirSync(this.config.paths.content);
      const markdownFiles = files.filter(file => file.endsWith('.md'));
      
      console.log('Found markdown files:', markdownFiles);
      
      for (let i = 0; i < markdownFiles.length; i++) {
        this.generatePage(path.join(this.config.paths.content, markdownFiles[i]));
      }
      
      // 复制静态文件
      this.copyStaticFiles();
      
    } catch (error) {
      console.error('Error reading content directory:', error.message);
    }
    
    console.log('Build Successfully');
  }

  // 运行方法
  run() {
    this.generateAllPages();
    
    if (this.watchMode) {
      console.log('Watch mode is not implemented yet');
    }
    
    if (this.serveMode) {
      console.log('Serve mode is not implemented yet');
    }
  }
}

// 运行生成器
try {
  const generator = new StaticSiteGenerator();
  generator.run();
} catch (error) {
  console.error('Fatal error:', error.message);
  process.exit(1);
}