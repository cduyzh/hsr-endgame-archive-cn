<script setup lang="ts">
  import { computed, onMounted, ref, shallowRef, watch } from "vue";
  import { useRouter } from "vue-router";
  import {
    AlertCircle,
    ChevronRight,
    Eraser,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Pencil,
    RotateCcw,
    Trash2,
    X,
    XCircle,
  } from "lucide-vue-next";
  import { useSubmissionDialog } from "@/composables/useSubmissionDialog";
  import { useSubmissionMemory } from "@/composables/useSubmissionMemory";
  import {
    deleteSubmission,
    listMySubmissions,
    setSubmissionHidden,
    withdrawSubmission,
    type MySubmissionRun,
  } from "@/services/archiveService";
  import { categoryLabels } from "@/services/runUtils";
  import type {
    EndgameMode,
    SubmissionEditTarget,
    SubmissionReview,
    SubmissionReviewStatus,
  } from "@/types/archive";

  const router = useRouter();
  const { openEdit: openSubmitDialog, isOpen: submitDialogOpen } =
    useSubmissionDialog();
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
      flags: [],
      units: [],
      lightcones: [],
    },
    teamSlotCount: 1,
  });

  const loading = ref(false);
  const errorMessage = ref("");
  const reviews = ref<SubmissionReview[]>([]);
  const runs = ref<MySubmissionRun[]>([]);
  const hiddenCount = ref(0);
  /** 展开已隐藏的记录：隐藏是服务端状态，默认整族不展示，否则用户换设备就找不回。 */
  const showHidden = ref(false);
  const actingId = ref("");
  const lastUpdated = ref("");
  /** 破坏性动作的就地二次确认：删除不可恢复，撤回会让记录从档案消失，都不该一次点击就走。 */
  const confirming = shallowRef<{ id: string; kind: "withdraw" | "delete" } | null>(null);

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
    () => groups.value.length > 0 || approvedRuns.value.length > 0,
  );
  const lastUpdatedLabel = computed(() => lastUpdated.value);

  /** 已通过的公开记录：runs 查询不带 status，这里必须自己收窄，否则驳回 / 撤回的记录会挂进「已通过的投稿」。 */
  const approvedRuns = computed(() =>
    runs.value.filter((run) => run.status === "approved"),
  );

  interface SubmissionGroup {
    parent: SubmissionReview;
    /** 该投稿的修订，新到旧（服务端按 created_at 倒序返回）。 */
    revisions: SubmissionReview[];
  }

  /**
   * 修订是独立的审核行，但它改的是同一条记录——单独出卡会出现两张内容矛盾的卡片，
   * 而且「撤回这条修订」按 id 打到 runs 时命中的是原投稿那行公开档案。所以按家族折叠。
   */
  const groups = computed<SubmissionGroup[]>(() => {
    const byId = new Map(reviews.value.map((review) => [review.id, review]));
    const list: SubmissionGroup[] = [];
    const groupOf = new Map<string, SubmissionGroup>();
    for (const review of reviews.value) {
      const rootId =
        review.revisesId && byId.has(review.revisesId)
          ? review.revisesId
          : review.id;
      let group = groupOf.get(rootId);
      if (!group) {
        // 父行可能不在本机凭证范围内（例如它属于另一台设备的凭证），此时以这条修订自身为卡头。
        group = { parent: byId.get(rootId) ?? review, revisions: [] };
        groupOf.set(rootId, group);
        list.push(group);
      }
      if (review.id !== group.parent.id) group.revisions.push(review);
    }
    return list;
  });

  function revisionSummary(group: SubmissionGroup) {
    const pending = group.revisions.find((item) => item.status === "pending");
    const latest = group.revisions[0];
    if (pending) {
      return {
        tone: "pending" as const,
        label: "修订待审核",
        note: "通过前档案仍展示当前记录",
        revision: pending,
      };
    }
    if (latest?.status === "approved") {
      return {
        tone: "approved" as const,
        label: "修订已合并",
        note: "档案已更新为最新内容",
        revision: latest,
      };
    }
    if (latest?.status === "rejected") {
      return {
        tone: "rejected" as const,
        label: "修订被驳回",
        note: latest.reviewerNote || "可继续修改后再次提交",
        revision: latest,
      };
    }
    return null;
  }

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

  function familyIds(group: SubmissionGroup): string[] {
    return [group.parent.id, ...group.revisions.map((item) => item.id)];
  }

  async function refresh() {
    if (memory.value.tokens.length === 0) {
      reviews.value = [];
      runs.value = [];
      hiddenCount.value = 0;
      return;
    }
    loading.value = true;
    errorMessage.value = "";
    confirming.value = null;
    try {
      const payload = await listMySubmissions(memory.value.tokens, {
        includeHidden: showHidden.value,
      });
      reviews.value = payload.reviews;
      runs.value = payload.runs;
      hiddenCount.value = payload.hiddenCount;
      lastUpdated.value = formatTime(new Date().toISOString());
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : "读取失败";
      reviews.value = [];
      runs.value = [];
      hiddenCount.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 就地两步确认：第一次点击只展开确认条，第二次才真正执行。卡片底部与修订行共用同一份状态。 */
  function confirmingFor(id: string, kind: "withdraw" | "delete") {
    const current = confirming.value;
    return Boolean(current && current.id === id && current.kind === kind);
  }

  function requestConfirm(id: string, kind: "withdraw" | "delete") {
    if (confirmingFor(id, kind)) return true;
    confirming.value = { id, kind };
    return false;
  }

  function cancelConfirm() {
    confirming.value = null;
  }

  async function runAction(
    review: SubmissionReview,
    action: (id: string, token: string) => Promise<unknown>,
    failureText: string,
  ) {
    if (!review.ownerToken) return;
    actingId.value = review.id;
    try {
      await action(review.id, review.ownerToken);
      await refresh();
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : failureText;
      actingId.value = "";
    }
  }

  async function handleWithdraw(review: SubmissionReview) {
    if (!review.ownerToken) return;
    if (review.status === "withdrawn") return;
    if (!requestConfirm(review.id, "withdraw")) return;
    confirming.value = null;
    await runAction(review, withdrawSubmission, "撤回失败");
  }

  async function handleDelete(review: SubmissionReview) {
    if (!review.ownerToken) return;
    if (review.status !== "rejected") return;
    if (!requestConfirm(review.id, "delete")) return;
    confirming.value = null;
    await runAction(review, deleteSubmission, "删除失败");
  }

  async function handleToggleHidden(review: SubmissionReview) {
    await runAction(
      review,
      (id, token) => setSubmissionHidden(id, token, !review.hidden),
      "更新可见性失败",
    );
  }

  /** 带着原内容打开投稿向导：有待审修订时基于修订继续改，否则基于原稿。 */
  function handleEdit(group: SubmissionGroup) {
    const source =
      group.revisions.find((item) => item.status === "pending") ?? group.parent;
    const token = group.parent.ownerToken;
    if (!token) return;
    const target: SubmissionEditTarget = {
      parentId: group.parent.id,
      token,
      payload: source.payload,
      // 服务端按父记录状态分流：已通过 → 新修订；已驳回 → 就地重提。
      origin: group.parent.status === "approved" ? "approved" : "rejected",
      excludeIds: familyIds(group),
    };
    openSubmitDialog(target);
  }

  async function toggleShowHidden() {
    showHidden.value = !showHidden.value;
    await refresh();
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
    hiddenCount.value = 0;
  }

  function gotoSubmit() {
    void router.push("/submit");
  }

  // 投稿弹窗（含编辑并重新提交）关闭后重新拉一次，否则刚提交的结果要手动刷新才可见。
  watch(submitDialogOpen, (open, wasOpen) => {
    if (wasOpen && !open) void refresh();
  });

  onMounted(() => {
    void refresh();
  });
</script>

<template>
  <main class="page-narrow my-submissions-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          我的投稿
        </p>
        <h1>追踪、修改或撤回本机已提交的记录</h1>
        <p>
          凭证只保存在你当前浏览器的
          localStorage，换浏览器或清缓存会丢失；想找回请把投稿编号发给站主。
        </p>
        <p>
          <RouterLink
            class="contact-link"
            to="/contact"
          >
            查看联系方式
          </RouterLink>
        </p>
      </div>
      <button
        v-if="tokensCount > 0"
        class="icon-button"
        type="button"
        :disabled="loading"
        @click="refresh"
      >
        <RotateCcw
          v-if="!loading"
          :size="16"
          aria-hidden="true"
        />
        <Loader2
          v-else
          :size="16"
          aria-hidden="true"
          class="spin"
        />
        {{ loading ? "刷新中" : "刷新" }}
      </button>
    </div>

    <section
      v-if="tokensCount === 0"
      class="my-submissions-empty"
    >
      <KeyRound
        :size="32"
        aria-hidden="true"
      />
      <h2>本机还没有投稿凭证</h2>
      <p>提交一条记录后，凭证会自动保存在这里，便于查询审核进度或撤回。</p>
      <button
        class="icon-button primary-action"
        type="button"
        @click="gotoSubmit"
      >
        前往投稿
        <ChevronRight
          :size="16"
          aria-hidden="true"
        />
      </button>
    </section>

    <section
      v-else
      class="my-submissions-toolbar"
    >
      <p>
        已记录 <strong>{{ tokensCount }}</strong> 个凭证，最近更新：{{
          lastUpdatedLabel || "尚未拉取"
        }}
      </p>
      <div class="my-submissions-toolbar-actions">
        <button
          v-if="hiddenCount > 0"
          class="icon-button subtle"
          type="button"
          :disabled="loading"
          :aria-expanded="showHidden"
          @click="toggleShowHidden"
        >
          <EyeOff
            v-if="!showHidden"
            :size="14"
            aria-hidden="true"
          />
          <Eye
            v-else
            :size="14"
            aria-hidden="true"
          />
          {{ showHidden ? "收起已隐藏" : `已隐藏 ${hiddenCount} 条 · 查看` }}
        </button>
        <button
          class="icon-button subtle"
          type="button"
          @click="handleClearAll"
        >
          <Eraser
            :size="14"
            aria-hidden="true"
          />
          清空本机凭证
        </button>
      </div>
    </section>

    <p
      v-if="errorMessage"
      class="submission-error"
      role="alert"
    >
      <AlertCircle
        :size="15"
        aria-hidden="true"
      />
      {{ errorMessage }}
    </p>

    <p
      v-if="tokensCount > 0 && !loading && !hasAny && !errorMessage"
      class="my-submissions-empty soft"
    >
      {{
        hiddenCount > 0 && !showHidden
          ? "本机凭证下的记录都已隐藏，点上方「已隐藏」查看。"
          : "凭证下暂时没有找到对应记录，可能还没审核或已被删除。"
      }}
    </p>

    <ol
      v-if="groups.length > 0"
      class="my-submissions-list"
    >
      <li
        v-for="group in groups"
        :key="group.parent.id"
        class="my-submission-card"
        :data-status="group.parent.status"
        :data-hidden="group.parent.hidden ? 'true' : undefined"
      >
        <header class="my-submission-card-head">
          <div>
            <p class="my-submission-team">
              {{ group.parent.payload?.teamName || "未命名队伍" }}
            </p>
            <p class="my-submission-meta">
              <span>{{
                modeLabels[group.parent.payload?.mode as EndgameMode] ||
                  group.parent.payload?.mode
              }}</span>
              <span>·</span>
              <span>{{ bossLabel(group.parent.payload?.bossId || "") }}</span>
              <span>·</span>
              <span>{{
                categoryLabels[
                  group.parent.payload?.category as keyof typeof categoryLabels
                ] || group.parent.payload?.category
              }}</span>
              <span>·</span>
              <span>{{ group.parent.payload?.author || "匿名" }}</span>
            </p>
          </div>
          <span
            class="my-submission-status"
            :data-status="group.parent.status"
          >
            <Loader2
              v-if="group.parent.status === 'pending'"
              :size="14"
              aria-hidden="true"
              class="spin"
            />
            <XCircle
              v-else-if="group.parent.status === 'rejected'"
              :size="14"
              aria-hidden="true"
            />
            <Eye
              v-else-if="group.parent.status === 'approved'"
              :size="14"
              aria-hidden="true"
            />
            <Trash2
              v-else
              :size="14"
              aria-hidden="true"
            />
            {{ statusLabels[group.parent.status] }}
            <em v-if="group.parent.hidden">· 已隐藏</em>
          </span>
        </header>

        <dl class="my-submission-meta-grid">
          <div>
            <dt>投稿编号</dt>
            <dd>
              <code>{{ group.parent.id }}</code>
            </dd>
          </div>
          <div>
            <dt>凭证</dt>
            <dd>
              <code>{{ group.parent.ownerToken || "—" }}</code>
            </dd>
          </div>
          <div>
            <dt>投稿时间</dt>
            <dd>{{ formatTime(group.parent.createdAt) }}</dd>
          </div>
          <div v-if="group.parent.reviewedAt">
            <dt>审核时间</dt>
            <dd>{{ formatTime(group.parent.reviewedAt) }}</dd>
          </div>
          <div
            v-if="group.parent.reviewerNote"
            class="span-2"
          >
            <dt>审核备注</dt>
            <dd>{{ group.parent.reviewerNote }}</dd>
          </div>
          <div class="span-2">
            <dt>阵容</dt>
            <dd>{{ teamSummary(group.parent) }}</dd>
          </div>
          <div v-if="group.parent.payload?.videoUrl">
            <dt>视频</dt>
            <dd>
              <a
                :href="group.parent.payload.videoUrl"
                target="_blank"
                rel="noopener noreferrer"
              >{{ group.parent.payload.videoUrl }}</a>
            </dd>
          </div>
        </dl>

        <p
          v-if="revisionSummary(group)"
          class="my-submission-revision"
          :data-tone="revisionSummary(group)!.tone"
        >
          <span class="my-submission-chip">{{
            revisionSummary(group)!.label
          }}</span>
          <span>{{ revisionSummary(group)!.note }}</span>
          <code>{{ revisionSummary(group)!.revision.id }}</code>
          <span
            v-if="revisionSummary(group)!.tone === 'pending'"
            class="my-submission-revision-actions"
          >
            <button
              v-if="!confirmingFor(revisionSummary(group)!.revision.id, 'withdraw')"
              type="button"
              class="icon-button subtle"
              :disabled="actingId === revisionSummary(group)!.revision.id"
              @click="requestConfirm(revisionSummary(group)!.revision.id, 'withdraw')"
            >
              撤回修订
            </button>
            <template v-else>
              <button
                type="button"
                class="icon-button danger"
                :disabled="actingId === revisionSummary(group)!.revision.id"
                @click="handleWithdraw(revisionSummary(group)!.revision)"
              >
                {{
                  actingId === revisionSummary(group)!.revision.id
                    ? "撤回中"
                    : "确认撤回这条修订"
                }}
              </button>
              <button
                type="button"
                class="icon-button subtle"
                @click="cancelConfirm"
              >
                取消
              </button>
            </template>
          </span>
        </p>

        <footer class="my-submission-card-foot">
          <template v-if="confirming && confirming.id === group.parent.id">
            <p class="my-submission-confirm">
              <AlertCircle
                :size="14"
                aria-hidden="true"
              />
              {{
                confirming.kind === "delete"
                  ? "确认永久删除？记录会从数据库移除，无法恢复。"
                  : "确认撤回？该记录不再出现在档案中。"
              }}
            </p>
            <span class="my-submission-confirm-actions">
              <button
                v-if="confirming.kind === 'delete'"
                type="button"
                class="icon-button danger"
                :disabled="actingId === group.parent.id"
                @click="handleDelete(group.parent)"
              >
                <Trash2
                  :size="14"
                  aria-hidden="true"
                />
                {{ actingId === group.parent.id ? "删除中" : "确认删除" }}
              </button>
              <button
                v-else
                type="button"
                class="icon-button danger"
                :disabled="actingId === group.parent.id"
                @click="handleWithdraw(group.parent)"
              >
                <Loader2
                  v-if="actingId === group.parent.id"
                  :size="14"
                  aria-hidden="true"
                  class="spin"
                />
                {{ actingId === group.parent.id ? "撤回中" : "确认撤回" }}
              </button>
              <button
                type="button"
                class="icon-button subtle"
                @click="cancelConfirm"
              >
                <X
                  :size="14"
                  aria-hidden="true"
                />
                取消
              </button>
            </span>
          </template>

          <template v-else>
            <button
              v-if="group.parent.ownerToken"
              type="button"
              class="icon-button subtle"
              :disabled="actingId === group.parent.id"
              @click="handleRemoveToken(group.parent.ownerToken as string)"
            >
              <Eraser
                :size="14"
                aria-hidden="true"
              />
              忘记该凭证
            </button>

            <button
              v-if="group.parent.status === 'approved' || group.parent.status === 'rejected'"
              type="button"
              class="icon-button"
              :disabled="actingId === group.parent.id"
              @click="handleEdit(group)"
            >
              <Pencil
                :size="14"
                aria-hidden="true"
              />
              编辑并重新提交
            </button>

            <button
              v-if="group.parent.status === 'rejected' || group.parent.status === 'withdrawn'"
              type="button"
              class="icon-button subtle"
              :disabled="actingId === group.parent.id"
              @click="handleToggleHidden(group.parent)"
            >
              <Eye
                v-if="group.parent.hidden"
                :size="14"
                aria-hidden="true"
              />
              <EyeOff
                v-else
                :size="14"
                aria-hidden="true"
              />
              {{ group.parent.hidden ? "取消隐藏" : "隐藏展示" }}
            </button>

            <button
              v-if="group.parent.status === 'pending' || group.parent.status === 'approved'"
              type="button"
              class="icon-button danger"
              :disabled="actingId === group.parent.id"
              @click="handleWithdraw(group.parent)"
            >
              <Loader2
                v-if="actingId === group.parent.id"
                :size="14"
                aria-hidden="true"
                class="spin"
              />
              <RotateCcw
                v-else
                :size="14"
                aria-hidden="true"
              />
              撤回该记录
            </button>

            <button
              v-if="group.parent.status === 'rejected'"
              type="button"
              class="icon-button danger"
              :disabled="actingId === group.parent.id"
              @click="handleDelete(group.parent)"
            >
              <Trash2
                :size="14"
                aria-hidden="true"
              />
              删除记录
            </button>

            <span
              v-if="group.parent.status === 'withdrawn' && !group.parent.hidden"
              class="my-submission-card-foot-hint"
            >该记录已撤回，不会再出现在档案中。</span>
          </template>
        </footer>
      </li>
    </ol>

    <section
      v-if="approvedRuns.length > 0"
      class="my-submissions-runs"
    >
      <h2>已通过的投稿</h2>
      <ol>
        <li
          v-for="run in approvedRuns"
          :key="run.id"
        >
          <strong>{{ teamSummaryFromRun(run) }}</strong>
          <span>{{ modeLabels[run.mode as EndgameMode] || run.mode }} ·
            {{ run.bossId }} · 轮次 {{ run.cycle }}</span>
          <span class="my-submissions-runs-time">{{
            formatTime(run.submittedAt)
          }}</span>
        </li>
      </ol>
      <p class="my-submissions-hint">
        已通过的投稿会同时进入上方"我的投稿"列表；修改请用该条投稿的「编辑并重新提交」。
      </p>
    </section>
  </main>
</template>
