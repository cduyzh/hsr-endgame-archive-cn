<template>
  <main class="page-narrow">
    <div class="page-heading">
      <p class="eyebrow">收录规则</p>
      <h1>FAQ</h1>
      <p>这里说明首版的投稿、审核和数据来源边界。</p>
    </div>

    <section class="faq-list">
      <article>
        <h2>记录如何收录？</h2>
        <p>投稿进入待审核队列。管理员确认视频可访问、队伍配置完整、分数与分类一致后再进入公开榜单。</p>
      </article>
      <article>
        <h2>成本如何计算？</h2>
        <p>首版按提交者填写的总成本存储，同时保留角色命座与光锥叠影，便于后续替换为统一计算器。</p>
      </article>
      <article>
        <h2>是否复制参考站资源？</h2>
        <p>不会。当前实现只参考信息架构和交互模式，图片与样式资源保持可替换策略，不依赖参考站运行。</p>
      </article>
      <article>
        <h2>没有数据库能运行吗？</h2>
        <p>可以。未配置 Postgres 时，前端与 Netlify Functions 都会回退到种子数据，方便本地预览和 UI 验收。</p>
      </article>
    </section>
  </main>
</template>
