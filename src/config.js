const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class SmartConfigLoader {
  constructor() {
    this.configPath = path.join(__dirname, '../config.yml');
    this.config = this.loadConfig();
    if (this.config) {
      this.autoDetectContent();
    }
  }

  loadConfig() {
    const baseConfig = {
    }
      if (fs.existsSync(this.configPath)) {
        console.log('找到配置文件:', this.configPath);
        const configFile = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = yaml.load(configFile);
        const mergedConfig = this.deepMerge(baseConfig, userConfig);
        return this.resolvePaths(mergedConfig);
      } 
    }

  // 深度合并对象
  deepMerge(target, source) {
    const output = Object.assign({}, target);
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(function(key) {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      }.bind(this));
    }
    
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // 解析路径为绝对路径
  resolvePaths(config) {
    const baseDir = path.join(__dirname, '..');
    if (config.paths) {
      Object.keys(config.paths).forEach(function(key) {
        if (typeof config.paths[key] === 'string') {
          if (config.paths[key].startsWith('./')) {
            config.paths[key] = path.join(baseDir, config.paths[key].substring(2));
          } else if (config.paths[key].startsWith('../')) {
            config.paths[key] = path.resolve(baseDir, config.paths[key]);
          }
          // 确保目录存在
          if (!fs.existsSync(config.paths[key])) {
            fs.mkdirSync(config.paths[key], { recursive: true });
            console.log('创建目录:', config.paths[key]);
          }
        }
      });
    }
    return config;
  }

  // 自动检测内容
  autoDetectContent() {
    try {
      // 初始化 content 对象
      this.config.content = {
        posts: [],
        categories: {},
        tags: {},
        pages: [],
        stats: {}
      };

      // 获取所有内容
      const allPosts = this.getAllPosts();
      this.config.content.posts = allPosts;
      
      // 获取分类和标签
      this.config.content.categories = this.getCategories(allPosts);
      this.config.content.tags = this.getTags(allPosts);
      
      // 获取页面
      this.config.content.pages = this.getPages();
      
      // 获取统计信息
      this.config.content.stats = this.getContentStats(allPosts);

      // 自动生成导航
      this.config.navigation = this.generateNavigation();
      
      // 自动生成最近文章
      this.config.recentPosts = this.getRecentPosts(allPosts, 5);

      console.log('内容检测完成:');
      console.log('- 文章:', allPosts.length);
      console.log('- 分类:', Object.keys(this.config.content.categories).length);
      console.log('- 标签:', Object.keys(this.config.content.tags).length);
      console.log('- 页面:', this.config.content.pages.length);

    } catch (error) {
      console.error('内容检测失败:', error.message);
      // 确保至少有默认结构
      this.config.content = {
        posts: [],
        categories: {},
        tags: {},
        pages: [],
        stats: {
          totalPosts: 0,
          totalWords: 0,
          totalReadingTime: 0,
          averageWords: 0,
          averageReadingTime: 0,
          publishedPosts: 0,
          draftPosts: 0,
          featuredPosts: 0
        }
      };
      this.config.navigation = [{ title: '首页', url: '/', icon: 'home', type: 'home' }];
      this.config.recentPosts = [];
    }
  }

  // 获取所有文章
  getAllPosts() {
    const posts = [];
    const contentPath = this.config.paths.content;
    
    if (!fs.existsSync(contentPath)) {
      console.log('内容目录不存在，创建:', contentPath);
      fs.mkdirSync(contentPath, { recursive: true });
      return posts;
    }

    this.walkDirectory(contentPath, (filePath, relativePath) => {
      if (filePath.endsWith('.md') && !relativePath.includes('index.md')) {
        const postData = this.extractPostData(filePath, relativePath);
        if (postData) {
          posts.push(postData);
        }
      }
    });

    return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // 提取文章数据
  extractPostData(filePath, relativePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const frontMatter = this.extractFrontMatter(content);
      
      if (!frontMatter) return null;

      const metadata = yaml.load(frontMatter);
      const markdownContent = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
      
      return {
        // post.xxx 数据
        title: metadata.title || path.basename(filePath, '.md'),
        date: metadata.date || new Date().toISOString().split('T')[0],
        layout: metadata.layout || 'post',
        categories: metadata.categories || [],
        tags: metadata.tags || [],
        author: metadata.author || this.config.site.author,
        excerpt: metadata.excerpt || this.generateExcerpt(markdownContent),
        featured: metadata.featured || false,
        draft: metadata.draft || false,
        
        // 系统数据
        path: relativePath,
        url: this.generateUrlFromPath(relativePath),
        filename: path.basename(filePath, '.md'),
        directory: path.dirname(relativePath),
        wordCount: this.countWords(markdownContent),
        readingTime: this.calculateReadingTime(markdownContent)
      };
    } catch (error) {
      console.warn('解析文章失败:', filePath, error.message);
      return null;
    }
  }

  // 提取 Front Matter
  extractFrontMatter(content) {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontMatterRegex);
    return match ? match[1] : null;
  }

  // 生成摘要
  generateExcerpt(content, length = 150) {
    const text = content.replace(/<[^>]*>/g, '').replace(/[\r\n]/g, ' ').trim();
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  // 统计字数
  countWords(text) {
    const words = text.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    return words.length;
  }

  // 计算阅读时间
  calculateReadingTime(text, wordsPerMinute = 200) {
    const wordCount = this.countWords(text);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  // 获取分类
  getCategories(posts) {
    const categories = {};
    posts.forEach(post => {
      if (post.categories && Array.isArray(post.categories)) {
        post.categories.forEach(category => {
          if (!categories[category]) {
            categories[category] = {
              name: category,
              count: 0,
              posts: [],
              url: `/category/${this.slugify(category)}/`
            };
          }
          categories[category].count++;
          categories[category].posts.push({
            title: post.title,
            url: post.url,
            date: post.date
          });
        });
      }
    });
    return categories;
  }

  // 获取标签
  getTags(posts) {
    const tags = {};
    posts.forEach(post => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(tag => {
          if (!tags[tag]) {
            tags[tag] = {
              name: tag,
              count: 0,
              posts: [],
              url: `/tag/${this.slugify(tag)}/`
            };
          }
          tags[tag].count++;
          tags[tag].posts.push({
            title: post.title,
            url: post.url,
            date: post.date
          });
        });
      }
    });
    return tags;
  }

  // 获取页面
  getPages() {
    const pages = [];
    const contentPath = this.config.paths.content;
    
    if (!fs.existsSync(contentPath)) return pages;

    this.walkDirectory(contentPath, (filePath, relativePath) => {
      if (filePath.endsWith('.md') && relativePath.includes('index.md')) {
        const pageData = this.extractPostData(filePath, relativePath);
        if (pageData) {
          pages.push(pageData);
        }
      }
    });

    return pages;
  }

  // 获取内容统计
  getContentStats(posts) {
    const publishedPosts = posts.filter(p => !p.draft);
    const totalWords = publishedPosts.reduce((sum, post) => sum + post.wordCount, 0);
    const totalReadingTime = publishedPosts.reduce((sum, post) => sum + post.readingTime, 0);
    
    return {
      totalPosts: posts.length,
      totalWords: totalWords,
      totalReadingTime: totalReadingTime,
      averageWords: posts.length > 0 ? Math.round(totalWords / posts.length) : 0,
      averageReadingTime: posts.length > 0 ? Math.round(totalReadingTime / posts.length) : 0,
      publishedPosts: publishedPosts.length,
      draftPosts: posts.filter(p => p.draft).length,
      featuredPosts: posts.filter(p => p.featured).length
    };
  }

  // 生成导航
  generateNavigation() {
    const navigation = [
      { 
        title: '首页', 
        url: '/', 
        icon: 'home',
        type: 'home'
      }
    ];

    // 添加主要分类
    const mainCategories = Object.values(this.config.content.categories)
      .filter(cat => cat.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    mainCategories.forEach(category => {
      navigation.push({
        title: category.name,
        url: category.url,
        icon: 'folder',
        count: category.count,
        type: 'category'
      });
    });

    // 添加关于页面
    const aboutPage = this.config.content.pages.find(p => p.filename === 'about');
    if (aboutPage) {
      navigation.push({
        title: '关于',
        url: aboutPage.url,
        icon: 'user',
        type: 'page'
      });
    }

    // 添加归档页面（如果有文章）
    if (this.config.content.stats.totalPosts > 0) {
      navigation.push({
        title: '归档',
        url: '/archive/',
        icon: 'archive',
        type: 'archive',
        count: this.config.content.stats.totalPosts
      });
    }

    return navigation;
  }

  // 获取最近文章
  getRecentPosts(posts, limit = 5) {
    return posts
      .filter(post => !post.draft)
      .slice(0, limit)
      .map(post => ({
        title: post.title,
        url: post.url,
        date: post.date,
        excerpt: post.excerpt
      }));
  }

  // 从路径生成 URL
  generateUrlFromPath(filePath) {
    const relativePath = filePath.replace(/\.md$/, '');
    const basename = path.basename(relativePath);
    const dirname = path.dirname(relativePath);
    
    if (basename === 'index') {
      return dirname === '.' ? '/' : `/${dirname}/`;
    }
    return `/${relativePath}/`;
  }

  // 生成 slug
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // 递归遍历目录
  walkDirectory(dir, callback, relativePath = '') {
    if (!fs.existsSync(dir)) return;
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (item.startsWith('.')) continue;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        const newRelativePath = relativePath ? path.join(relativePath, item) : item;
        
        if (stat.isDirectory()) {
          this.walkDirectory(fullPath, callback, newRelativePath);
        } else {
          callback(fullPath, newRelativePath);
        }
      }
    } catch (error) {
      console.warn('遍历目录失败:', dir, error.message);
    }
  }

  // 重新加载配置
  reload() {
    this.config = this.loadConfig();
    if (this.config) {
      this.autoDetectContent();
    }
    return this.config;
  }

  // 获取配置
  getConfig() {
    return this.config || {};
  }

  // 获取内容数据
  getContent() {
    return this.config ? this.config.content : {};
  }

  // 根据类型获取内容
  getContentByType(type, slug = null) {
    if (!this.config || !this.config.content) return null;
    
    switch (type) {
      case 'posts':
        return this.config.content.posts;
      case 'categories':
        return slug ? this.config.content.categories[slug] : this.config.content.categories;
      case 'tags':
        return slug ? this.config.content.tags[slug] : this.config.content.tags;
      case 'pages':
        return this.config.content.pages;
      case 'recent':
        return this.config.recentPosts;
      case 'stats':
        return this.config.content.stats;
      default:
        return null;
    }
  }
}

// 导出实例
const configLoader = new SmartConfigLoader();
module.exports = configLoader.getConfig();