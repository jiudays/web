const fs = require('fs');
const path = require('path');
const marked = require('marked');
const ejs = require('ejs');
const chokidar = require('chokidar');
const config = require('./config');

marked.setOptions(config.markdown);

class StaticSiteGenerator {
  constructor() {
    this.watchMode = process.argv.includes('--watch');
    this.serveMode = process.argv.includes('--serve');
    this.config = config;
    this.allPosts = [];
    this.validatePaths();
  }

  validatePaths() {
    const requiredPaths = ['content', 'templates', 'static', 'output'];
    var self = this;
    
    requiredPaths.forEach(function(pathType) {
      const dirPath = self.config.paths[pathType];
      if (!fs.existsSync(dirPath)) {
        console.log('Creating directory:', dirPath);
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  findMarkdownFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    var self = this;
    
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        results = results.concat(self.findMarkdownFiles(filePath));
      } else if (file.endsWith('.md')) {
        results.push(filePath);
      }
    }
    
    return results;
  }

  collectPostsInfo() {
    const markdownFiles = this.findMarkdownFiles(this.config.paths.content);
    this.allPosts = [];
    var self = this;
    
    markdownFiles.forEach(function(filePath) {
      if (path.basename(filePath) === 'index.md') return;
      
      const postData = self.parseMarkdownFile(filePath);
      if (postData) {
        self.allPosts.push({
          title: postData.metadata.title,
          date: new Date(postData.metadata.date),
          formattedDate: self.formatDate(postData.metadata.date),
          url: postData.url,
          excerpt: self.generateExcerpt(postData.content),
          tags: postData.metadata.tags || []
        });
      }
    });
    
    this.allPosts.sort(function(a, b) {
      return b.date - a.date;
    });
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  generateExcerpt(content, length) {
    if (length === void 0) { length = 150; }
    const text = content.replace(/<[^>]*>/g, '');
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  generateHomePage() {
    try {
      const templateName = 'home';
      const templatePath = path.join(this.config.paths.templates, templateName + '.ejs');
      
      if (!fs.existsSync(templatePath)) {
        this.generatePage(path.join(this.config.paths.content, 'index.md'));
        return;
      }
      
      const template = fs.readFileSync(templatePath, 'utf8');
      var self = this;
      
      const htmlContent = ejs.render(template, {
        site: self.config.site,
        posts: self.allPosts,
        totalPosts: self.allPosts.length,
        navigation: self.config.navigation || [],
        social: self.config.social || [],
        currentYear: new Date().getFullYear(),
        config: self.config,
        custom: self.config.custom || {}
      });
      
      const outputPath = path.join(this.config.paths.output, 'index.html');
      const outputDir = path.dirname(outputPath);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, htmlContent);
      console.log('Generated: index.html (homepage)');
      
    } catch (error) {
      console.error('Homepage generation failed:', error.message);
      this.generatePage(path.join(this.config.paths.content, 'index.md'));
    }
  }

  parseMarkdownFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(this.config.paths.content, filePath);
      
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
      
      const filename = path.basename(filePath, '.md');
      
      return {
        filePath: filePath,
        filename: filename,
        metadata: {
          title: metadata.title || this.formatTitle(filename),
          date: metadata.date || new Date().toISOString().split('T')[0],
          layout: metadata.layout || 'base',
          ...metadata
        },
        content: marked.parse(markdownContent),
        url: this.generateUrl(filePath)
      };
    } catch (error) {
      console.error('Error reading file:', filePath, error.message);
      return null;
    }
  }

  formatTitle(filename) {
    return filename
      .split('-')
      .map(function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  generateUrl(filePath) {
    const relativePath = path.relative(this.config.paths.content, filePath);
    const withoutExt = relativePath.replace(/\.md$/, '');
    
    if (path.basename(withoutExt) === 'index') {
      const dirPath = path.dirname(withoutExt);
      return dirPath === '.' ? '/' : '/' + dirPath + '/';
    }
    
    return '/' + withoutExt + '/';
  }

  getOutputPath(filePath) {
    const relativePath = path.relative(this.config.paths.content, filePath);
    const withoutExt = relativePath.replace(/\.md$/, '');
    
    if (path.basename(withoutExt) === 'index') {
      const dirPath = path.dirname(withoutExt);
      return dirPath === '.' ? 'index.html' : path.join(dirPath, 'index.html');
    }
    
    return path.join(withoutExt, 'index.html');
  }

  renderTemplate(templateName, data) {
    const templatePath = path.join(this.config.paths.templates, templateName + '.ejs');
    
    try {
      const template = fs.readFileSync(templatePath, 'utf8');
      var self = this;
      
      return ejs.render(template, {
        site: self.config.site,
        page: data,
        navigation: self.config.navigation || [],
        social: self.config.social || [],
        currentYear: new Date().getFullYear(),
        config: self.config,
        custom: self.config.custom || {}
      });
    } catch (error) {
      console.error('Render template failed:', error.message);
      return '<h1>Template Error</h1><p>' + error.message + '</p>';
    }
  }

  generatePage(markdownFile) {
    try {
      const pageData = this.parseMarkdownFile(markdownFile);
      if (!pageData) return;
      
      const templateName = pageData.metadata.layout;
      const htmlContent = this.renderTemplate(templateName, pageData);
      
      const outputPath = path.join(this.config.paths.output, this.getOutputPath(markdownFile));
      const outputDir = path.dirname(outputPath);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, htmlContent);
      console.log('Generated: ' + this.getOutputPath(markdownFile));
      
    } catch (error) {
      console.error('Build Failed:', error.message);
    }
  }

  copyStaticFiles() {
    try {
      if (!fs.existsSync(this.config.paths.static)) {
        fs.mkdirSync(this.config.paths.static, { recursive: true });
        return;
      }
      
      this.copyRecursive(this.config.paths.static, this.config.paths.output);
      console.log('Static files copied');
      
    } catch (error) {
      console.error('Error copying static files:', error.message);
    }
  }

  copyRecursive(src, dest) {
    if (fs.existsSync(src)) {
      const stat = fs.statSync(src);
      
      if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        
        const items = fs.readdirSync(src);
        var self = this;
        
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item !== '.git') {
            self.copyRecursive(
              path.join(src, item),
              path.join(dest, item)
            );
          }
        }
      } else {
        fs.copyFileSync(src, dest);
      }
    }
  }

  cleanOutput() {
    try {
      if (this.config.build.cleanOutput && fs.existsSync(this.config.paths.output)) {
        this.cleanDirectory(this.config.paths.output);
        console.log('Output directory cleaned');
      }
    } catch (error) {
      console.error('Error cleaning output:', error.message);
    }
  }

  cleanDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath);
      var self = this;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item !== '.git') {
          const itemPath = path.join(dirPath, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            self.cleanDirectory(itemPath);
            fs.rmdirSync(itemPath);
          } else {
            fs.unlinkSync(itemPath);
          }
        }
      }
    }
  }

  generateAllPages() {
    console.log('Building...');
    
    this.cleanOutput();
    
    if (!fs.existsSync(this.config.paths.output)) {
      fs.mkdirSync(this.config.paths.output, { recursive: true });
    }
    
    this.collectPostsInfo();
    
    if (this.config.build.generateHomepage) {
      this.generateHomePage();
    }
    
    const markdownFiles = this.findMarkdownFiles(this.config.paths.content);
    var self = this;
    
    for (let i = 0; i < markdownFiles.length; i++) {
      const file = markdownFiles[i];
      if (path.basename(file) === 'index.md' && this.config.build.generateHomepage) continue;
      
      self.generatePage(file);
    }
    
    this.copyStaticFiles();
    
    console.log('Build completed! Total posts: ' + this.allPosts.length);
  }

  run() {
    this.generateAllPages();
    
    if (this.watchMode) {
      console.log('Watch mode enabled');
      this.startWatching();
    }
    
    if (this.serveMode) {
      console.log('Serve mode enabled');
      this.startServer();
    }
  }

  startWatching() {
    console.log('Watching for changes...');
    var self = this;
    
    const watcher = chokidar.watch([
      this.config.paths.content,
      this.config.paths.templates,
      this.config.paths.static,
      path.join(this.config.paths.config, 'site.yml')
    ], {
      ignored: /(^|[\/\\])\../,
      persistent: true
    });
    
    watcher.on('change', function(filePath) {
      console.log('File changed:', path.basename(filePath));
      
      if (filePath.endsWith('site.yml')) {
        const ConfigLoader = require('./config');
        self.config = ConfigLoader;
        console.log('Config reloaded');
      }
      
      self.generateAllPages();
    });
  }

  startServer() {
    const liveServer = require('live-server');
    const params = {
      port: this.config.server.port,
      root: this.config.paths.output,
      open: this.config.server.open,
      wait: this.config.server.wait || 1000,
      logLevel: this.config.server.logLevel || 2
    };
    
    liveServer.start(params);
    console.log('Server started: http://localhost:' + params.port);
  }
}

const generator = new StaticSiteGenerator();
generator.run();