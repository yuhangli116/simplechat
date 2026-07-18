export function SiteFooter() {
  return (
    <footer className="mt-auto shrink-0 border-t border-border bg-background/95 px-4 py-1.5 text-center text-[10px] text-muted-foreground shadow-[0_-1px_0_rgba(0,0,0,0.04)] backdrop-blur sm:text-[11px]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 leading-4">
        <span>© 2026 北京市笔影客人工智能技术中心</span>
        <span className="hidden sm:inline">|</span>
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-foreground"
        >
          京ICP备2026040241号-1
        </a>
        <span className="hidden sm:inline">|</span>
        <span className="inline-flex items-center gap-1">
          <img src="/imgs/beian.jpeg" alt="公安备案标识" className="h-3.5 w-3.5" />
          <a
            href="https://beian.mps.gov.cn/#/query/webSearch?code=11011402056531"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            京公网安备11011402056531号
          </a>
        </span>
      </div>
    </footer>
  )
}
