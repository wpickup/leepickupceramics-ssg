#!/usr/bin/env ruby
# build.rb — static site builder for leepickupceramics.com
#
# Same architecture and idioms as williampickup-ssg / gaiayoga-ssg's build.rb
# (proven, well-understood). Small content model: a handful of static pages
# plus occasional news posts. The two gallery pages are ordinary pages whose
# bodies carry a `.gallery[data-album]` mount point — the photos themselves
# are loaded live client-side (see assets/gallery.js), not baked in at build.

require 'erb'
require 'date'
require 'fileutils'
require 'yaml'
require 'kramdown'
require 'cgi'

# ── Configuration ─────────────────────────────────────────────────────────────

SITE_URL     = 'https://leepickupceramics.com'
SITE_TITLE   = 'Lee Pickup Ceramics'
SITE_DESC    = 'Hand made ceramics for everyday use — wheel-thrown and slab-built stoneware by Lee Pickup.'
AUTHOR_NAME  = 'Lee Pickup'
COPYRIGHT_YEAR = Date.today.year

SRC_DIR       = __dir__
OUT_DIR       = ENV['SSG_OUT_DIR'] || File.join(__dir__, '_out')
PAGES_DIR     = File.join(__dir__, '_pages')
POSTS_DIR     = File.join(__dir__, '_posts')
TEMPLATES_DIR = File.join(__dir__, '_templates')
PARTIALS_DIR  = File.join(__dir__, '_partials')
STATIC_DIRS   = %w[css assets].map { |d| File.join(SRC_DIR, d) }

# ── Helpers ───────────────────────────────────────────────────────────────────

def md_to_html(text)
  return '' if text.nil? || text.empty?
  Kramdown::Document.new(text, input: :kramdown, smart_quotes: 'lsquo,rsquo,ldquo,rdquo', hard_wrap: false).to_html
end

def parse_frontmatter(path)
  raw = File.read(path, encoding: 'utf-8')
  if raw =~ /\A---\s*\n(.*?)\n---\s*\n(.*)\z/m
    fm   = YAML.safe_load($1, permitted_classes: [Date, Time]) || {}
    body = $2.strip
  else
    fm   = {}
    body = raw.strip
  end
  [fm, body]
end

# ── Models ────────────────────────────────────────────────────────────────────

class Page
  attr_reader :slug, :title, :content_html, :path

  def initialize(path)
    @path = path
    fm, body = parse_frontmatter(path)
    @slug         = fm['page'] || File.basename(path, '.md')
    @title        = fm['title'] || @slug
    @content_html = md_to_html(body)
  end

  def home?  = slug == 'home'
  def depth  = slug.count('/')
  def root   = '../' * depth
  def out    = home? ? 'index.html' : "#{slug}.html"
  def url    = home? ? "#{SITE_URL}/" : "#{SITE_URL}/#{slug}.html"
end

class Post
  attr_reader :slug, :title, :date, :categories, :content_html, :path

  def initialize(path)
    @path = path
    fm, body = parse_frontmatter(path)
    @slug         = fm['slug'] || File.basename(path, '.md')
    @title        = fm['title'] || @slug
    @date         = case fm['date']
                    when String then Date.parse(fm['date'])
                    when Time   then fm['date'].to_date
                    else fm['date']
                    end
    @categories   = Array(fm['categories'])
    @content_html = md_to_html(body)
  end

  def url          = "#{SITE_URL}/news/#{slug}.html"
  def date_display = date&.strftime('%-d %B %Y') || ''
  def date_iso     = date&.iso8601 || ''
end

# ── Renderer ──────────────────────────────────────────────────────────────────

class Renderer
  def render(template_name, locals = {})
    path     = File.join(TEMPLATES_DIR, "#{template_name}.html.erb")
    template = ERB.new(File.read(path), trim_mode: '-')
    template.result(make_binding(locals))
  end

  def partial(name, locals = {})
    path     = File.join(PARTIALS_DIR, "_#{name}.html.erb")
    template = ERB.new(File.read(path), trim_mode: '-')
    template.result(make_binding(locals))
  end

  def h(str) = CGI.escapeHTML(str.to_s)

  private

  def make_binding(locals)
    b = binding
    locals.each { |k, v| b.local_variable_set(k, v) }
    b.local_variable_set(:renderer, self)
    b
  end
end

# ── Build helpers ─────────────────────────────────────────────────────────────

def load_pages
  Dir[File.join(PAGES_DIR, '*.md')].map { |p| Page.new(p) rescue (warn "Error loading #{p}: #{$!}"; nil) }.compact
end

def load_posts
  Dir[File.join(POSTS_DIR, '*.md')]
    .map { |p| Post.new(p) rescue (warn "Error loading #{p}: #{$!}"; nil) }
    .compact.sort_by { |p| p.date || Date.new(1970) }.reverse
end

def write(path, content)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content, encoding: 'utf-8')
  puts "  #{path.sub(OUT_DIR + '/', '')}"
end

# ── Build ─────────────────────────────────────────────────────────────────────

def build
  puts "Building site → #{OUT_DIR}"
  FileUtils.rm_rf(OUT_DIR)
  FileUtils.mkdir_p(OUT_DIR)

  pages = load_pages
  posts = load_posts
  puts "Loaded: #{pages.length} pages, #{posts.length} posts"

  r = Renderer.new

  puts "\nPages:"
  pages.each do |page|
    template = page.home? ? 'home' : 'page'
    html = r.render(template, page: page, root: page.root)
    write(File.join(OUT_DIR, page.out), html)
  end

  puts "\nNews:"
  write(File.join(OUT_DIR, 'news.html'), r.render('news', posts: posts, root: ''))
  posts.each do |post|
    write(File.join(OUT_DIR, 'news', "#{post.slug}.html"), r.render('post', post: post, root: '../'))
  end

  puts "\nAssets:"
  STATIC_DIRS.each do |src|
    next unless Dir.exist?(src)
    dest = File.join(OUT_DIR, File.basename(src))
    FileUtils.rm_rf(dest)
    FileUtils.cp_r(src, dest)
    puts "  #{File.basename(src)}/"
  end

  # GitHub Pages custom domain — read on every Pages build regardless of the
  # repo's dashboard "Custom domain" setting, so the apex keeps working even
  # if that setting is ever cleared.
  File.write(File.join(OUT_DIR, 'CNAME'), 'leepickupceramics.com')

  puts "\nDone. #{pages.length} pages · #{posts.length} posts"
end

build if __FILE__ == $0
