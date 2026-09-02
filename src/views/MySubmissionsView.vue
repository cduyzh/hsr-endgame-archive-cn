<script setup lang="ts">
  import { computed, onMounted, ref } from "vue";
  import { useRouter } from "vue-router";
  import {
    AlertCircle,
    ChevronRight,
    Eraser,
    Eye,
    KeyRound,
    Loader2,
    RotateCcw,
    Trash2,
    XCircle,
  } from "lucide-vue-next";
  import { useSubmissionMemory } from "@/composables/useSubmissionMemory";
  import {
    listMySubmissions,
    withdrawSubmission,
    type MySubmissionRun,
  } from "@/services/archiveService";
  import { categoryLabels } from "@/services/runUtils";
  import type {
    EndgameMode,
    SubmissionReview,
    SubmissionReviewStatus,
  } from "@/types/archive";

  const router = useRouter();
  const { memory, removeToken, clearTokens } = useSubmissionMemory({
    payload: {
      seasonId: "",
      mode: "moc",
      bossId: "",
      category: "fullStars",
      author: "",
      teamName: "",
      cycle: 0,
      score: 0,
      cost: 0,
      videoUrl: "",
      notes: "",
      units: [],
      lightcones: [],
    },
    teamSlotCount: 1,
  });

  const loading = ref(false);
  const errorMessage = ref("");
  const reviews = ref<SubmissionReview[]>([]);
  const runs = ref<MySubmissionRun[]>([]);
  const actingId = ref("");
  const lastUpdated = ref("");

  const modeLabels: Record<EndgameMode, string> = {
    moc: "忘却之庭",
    pf: "虚构叙事",
    as: "末日幻影",
    aa: "异相仲裁",
  };

  const statusLabels: Record<SubmissionReviewStatus, string> = {
    pending: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    withdrawn: "已撤回",
  };

  const tokensCount = computed(() => memory.value.tokens.length);
  const hasAny = computed(
    () => reviews.value.length > 0 || runs.value.length > 0,
  );
  const lastUpdatedLabel = computed(() => lastUpdated.value);

  function formatTime(iso: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function teamSummary(review: SubmissionReview): string {
    const units = (review.payload?.units ?? [])
      .map((slot) => slot.unitId)
      .filter(Boolean);
    return units.length === 0 ? "未提供阵容" : units.join(" / ");
  }

  function teamSummaryFromRun(run: MySubmissionRun): string {
    return run.teamName?.trim() || `${run.author} 的投稿`;
  }

  function bossLabel(bossId: string): string {
    return bossId || "—";
  }

  async function refresh() {
    if (memory.value.tokens.length === 0) {
      reviews.value = [];
      runs.value = [];
      return;
    }
    loading.value = true;
    errorMessage.value = "";
    try {
      const payload = await listMySubmissions(memory.value.tokens);
      reviews.value = payload.reviews;
      runs.value = payload.runs;
      lastUpdated.value = formatTime(new Date().toISOString());
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : "读取失败";
      reviews.value = [];
      runs.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function handleWithdraw(review: SubmissionReview) {
    if (!review.ownerToken) return;
    if (review.status === "withdrawn") return;
    const confirmed = window.confirm(
      `确认撤回「${review.payload?.teamName || "这条"}」？撤回后该记录不再公开展示。`,
    );
    if (!confirmed) return;
    actingId.value = review.id;
    try {
      await withdrawSubmission(review.id, review.ownerToken);
      await refresh();
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : "撤回失败";
    } finally {
      actingId.value = "";
    }
  }

  function handleRemoveToken(token: string) {
    const confirmed = window.confirm(
      "从本地删除该凭证？已上传的投稿不会被删除，只是这台设备不再追踪它。",
    );
    if (!confirmed) return;
    removeToken(token);
    void refresh();
  }

  function handleClearAll() {
    if (memory.value.tokens.length === 0) return;
    const confirmed = window.confirm(
      "清空本机所有投稿凭证？已上传的投稿不会被删除，只是这台设备不再追踪它们。",
    );
    if (!confirmed) return;
    clearTokens();
    reviews.value = [];
    runs.value = [];
  }

  function gotoSubmit() {
    void router.push("/submit");
  }

  onMounted(() => {
    void refresh();
  });
</script>

<template>
  <main class="page-narrow my-submissions-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">我的投稿</p>
        <h1>追踪、编辑或撤回本机已提交的记录</h1>
        <p>
          凭证只保存在你当前浏览器的
          localStorage，换浏览器或清缓存会丢失；想找回请联系管理员通过投稿编号定位。
        </p>
      </div>
      <button
        v-if="tokensCount > 0"
        class="icon-button"
        type="button"
        :disabled="loading"
        @click="refresh">
        <RotateCcw
          v-if="!loading"
          :size="16"
          aria-hidden="true" />
        <Loader2
          v-else
          :size="16"
          aria-hidden="true"
          class="spin" />
        {{ loading ? "刷新中" : "刷新" }}
      </button>
    </div>

    <section
      v-if="tokensCount === 0"
      class="my-submissions-empty">
      <KeyRound
        :size="32"
        aria-hidden="true" />
      <h2>本机还没有投稿凭证</h2>
      <p>提交一条记录后，凭证会自动保存在这里，便于查询审核进度或撤回。</p>
      <button
        class="icon-button primary-action"
        type="button"
        @click="gotoSubmit">
        前往投稿
        <ChevronRight
          :size="16"
          aria-hidden="true" />
      </button>
    </section>

    <section
      v-else
      class="my-submissions-toolbar">
      <p>
        已记录 <strong>{{ tokensCount }}</strong> 个凭证，最近更新：{{
          lastUpdatedLabel || "尚未拉取"
        }}
      </p>
      <button
        class="icon-button subtle"
        type="button"
        @click="handleClearAll">
        <Eraser
          :size="14"
          aria-hidden="true" />
        清空本机凭证
      </button>
    </section>

    <p
      v-if="errorMessage"
      class="submission-error"
      role="alert">
      <AlertCircle
        :size="15"
        aria-hidden="true" />
      {{ errorMessage }}
    </p>

    <p
      v-if="tokensCount > 0 && !loading && !hasAny && !errorMessage"
      class="my-submissions-empty soft">
      凭证下暂时没有找到对应记录，可能还没审核或已被删除。
    </p>

    <ol
      v-if="reviews.length > 0"
      class="my-submissions-list">
      <li
        v-for="review in reviews"
        :key="review.id"
        class="my-submission-card"
        :data-status="review.status">
        <header class="my-submission-card-head">
          <div>
            <p class="my-submission-team">
              {{ review.payload?.teamName || "未命名队伍" }}
            </p>
            <p class="my-submission-meta">
              <span>{{
                modeLabels[review.payload?.mode as EndgameMode] ||
                review.payload?.mode
              }}</span>
              <span>·</span>
              <span>{{ bossLabel(review.payload?.bossId || "") }}</span>
              <span>·</span>
              <span>{{
                categoryLabels[
                  review.payload?.category as keyof typeof categoryLabels
                ] || review.payload?.category
              }}</span>
              <span>·</span>
              <span>{{ review.payload?.author || "匿名" }}</span>
            </p>
          </div>
          <span
            class="my-submission-status"
            :data-status="review.status">
            <Loader2
              v-if="review.status === 'pending'"
              :size="14"
              aria-hidden="true"
              class="spin" />
            <XCircle
              v-else-if="review.status === 'rejected'"
              :size="14"
              aria-hidden="true" />
            <Eye
              v-else-if="review.status === 'approved'"
              :size="14"
              aria-hidden="true" />
            <Trash2
              v-else
              :size="14"
              aria-hidden="true" />
            {{ statusLabels[review.status] }}
          </span>
        </header>

        <dl class="my-submission-meta-grid">
          <div>
            <dt>投稿编号</dt>
            <dd>
              <code>{{ review.id }}</code>
            </dd>
          </div>
          <div>
            <dt>凭证</dt>
            <dd>
              <code>{{ review.ownerToken || "—" }}</code>
            </dd>
          </div>
          <div>
            <dt>投稿时间</dt>
            <dd>{{ formatTime(review.createdAt) }}</dd>
          </div>
          <div v-if="review.reviewedAt">
            <dt>审核时间</dt>
            <dd>{{ formatTime(review.reviewedAt) }}</dd>
          </div>
          <div
            v-if="review.reviewerNote"
            class="span-2">
            <dt>审核备注</dt>
            <dd>{{ review.reviewerNote }}</dd>
          </div>
          <div class="span-2">
            <dt>阵容</dt>
            <dd>{{ teamSummary(review) }}</dd>
          </div>
          <div v-if="review.payload?.videoUrl">
            <dt>视频</dt>
            <dd>
              <a
                :href="review.payload.videoUrl"
                target="_blank"
                rel="noopener noreferrer"
                >{{ review.payload.videoUrl }}</a
              >
            </dd>
          </div>
        </dl>

        <footer class="my-submission-card-foot">
          <button
            v-if="review.ownerToken"
            type="button"
            class="icon-button subtle"
            :disabled="actingId === review.id"
            @click="handleRemoveToken(review.ownerToken as string)">
            <Eraser
              :size="14"
              aria-hidden="true" />
            忘记该凭证
          </button>
          <button
            v-if="review.status !== 'withdrawn'"
            type="button"
            class="icon-button danger"
            :disabled="actingId === review.id"
            @click="handleWithdraw(review)">
            <Loader2
              v-if="actingId === review.id"
              :size="14"
              aria-hidden="true"
              class="spin" />
            <Trash2
              v-else
              :size="14"
              aria-hidden="true" />
            {{ actingId === review.id ? "撤回中" : "撤回该记录" }}
          </button>
          <span
            v-else
            class="my-submission-card-foot-hint"
            >该记录已撤回，不会再出现在档案中。</span
          >
        </footer>
      </li>
    </ol>

    <section
      v-if="runs.length > 0"
      class="my-submissions-runs">
      <h2>已通过的投稿</h2>
      <ol>
        <li
          v-for="run in runs"
          :key="run.id">
          <strong>{{ teamSummaryFromRun(run) }}</strong>
          <span
            >{{ modeLabels[run.mode as EndgameMode] || run.mode }} ·
            {{ run.bossId }} · 轮次 {{ run.cycle }}</span
          >
          <span class="my-submissions-runs-time">{{
            formatTime(run.submittedAt)
          }}</span>
        </li>
      </ol>
      <p class="my-submissions-hint">
        已通过的投稿会同时进入上方"我的投稿"列表；如需撤回，请通过该条投稿的凭证操作。
      </p>
    </section>
  </main>
</template>
