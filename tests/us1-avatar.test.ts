import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";
process.env.CLOUDINARY_CLOUD_NAME = "cira-pm-test";
process.env.CLOUDINARY_API_KEY = "test-cloudinary-key";
process.env.CLOUDINARY_API_SECRET = "test-cloudinary-secret";

const [
  { avatarSchema },
  { authRepository },
  { authService },
  { cloudinaryStorage, withResolvedUserAvatar },
  { projectsRepository },
  { projectsService },
  { governanceRepository },
  { governanceService },
  { tasksRepository },
  { tasksService },
  { sprintsRepository },
  { sprintsService },
  { activityRepository },
  { activityService },
] = await Promise.all([
  import("../src/features/auth/auth.schema.js"),
  import("../src/features/auth/auth.repository.js"),
  import("../src/features/auth/auth.service.js"),
  import("../src/features/assets/cloudinary.service.js"),
  import("../src/features/projects/projects.repository.js"),
  import("../src/features/projects/projects.service.js"),
  import("../src/features/projects/governance.repository.js"),
  import("../src/features/projects/governance.service.js"),
  import("../src/features/tasks/tasks.repository.js"),
  import("../src/features/tasks/tasks.service.js"),
  import("../src/features/sprints/sprints.repository.js"),
  import("../src/features/sprints/sprints.service.js"),
  import("../src/features/activity/activity.repository.js"),
  import("../src/features/activity/activity.service.js"),
]);

// ==========================================
// AC-1: Validasi Payload & Layanan Upload Avatar
// ==========================================

test("AC-1: avatarSchema menerima PNG/JPEG/WebP crop dalam batas dan menolak SVG/URL/payload terlalu besar", () => {
  assert.equal(
    avatarSchema.safeParse({ dataUrl: "data:image/png;base64,aGVsbG8=" }).success,
    true,
  );
  assert.equal(
    avatarSchema.safeParse({ dataUrl: "data:image/jpeg;base64,aGVsbG8=" }).success,
    true,
  );
  assert.equal(
    avatarSchema.safeParse({ dataUrl: "data:image/webp;base64,aGVsbG8=" }).success,
    true,
  );

  assert.equal(
    avatarSchema.safeParse({ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }).success,
    false,
  );
  assert.equal(
    avatarSchema.safeParse({ dataUrl: "https://evil.example/avatar.png" }).success,
    false,
  );
  assert.equal(
    avatarSchema.safeParse({ dataUrl: `data:image/webp;base64,${"A".repeat(2_700_000)}` }).success,
    false,
  );
});

test("AC-1: authService.uploadAvatar mengunggah crop baru, menghapus aset lama, dan rollback bila update DB gagal", async (t) => {
  const originalFindById = authRepository.findById;
  const originalUpdateAvatar = authRepository.updateAvatar;
  const originalUpload = cloudinaryStorage.upload;
  const originalDestroy = cloudinaryStorage.destroy;

  t.after(() => {
    authRepository.findById = originalFindById;
    authRepository.updateAvatar = originalUpdateAvatar;
    cloudinaryStorage.upload = originalUpload;
    cloudinaryStorage.destroy = originalDestroy;
  });

  const destroyedRefs: string[] = [];
  const uploadedFolders: string[] = [];

  authRepository.findById = (async () => ({
    id: "user-1",
    name: "Andi Budiman",
    email: "andi@cira.id",
    roles: ["developer"],
    whatsapp: null,
    instagram: null,
    isActive: true,
    isPrimaryOwner: false,
    avatarUrl: "cloudinary://image:webp:cira-pm/avatars/user-1/old-photo",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })) as unknown as typeof authRepository.findById;

  cloudinaryStorage.upload = async (_dataUrl, folder) => {
    uploadedFolders.push(folder);
    return "cloudinary://image:webp:cira-pm/avatars/user-1/new-photo";
  };

  cloudinaryStorage.destroy = async (ref) => {
    destroyedRefs.push(ref);
  };

  authRepository.updateAvatar = (async (_id, avatarUrl) => ({
    id: "user-1",
    name: "Andi Budiman",
    email: "andi@cira.id",
    roles: ["developer"],
    whatsapp: null,
    instagram: null,
    isActive: true,
    isPrimaryOwner: false,
    avatarUrl,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  })) as unknown as typeof authRepository.updateAvatar;

  const updated = await authService.uploadAvatar("user-1", "data:image/webp;base64,aGVsbG8=");
  assert.deepEqual(uploadedFolders, ["cira-pm/avatars/user-1"]);
  assert.deepEqual(destroyedRefs, ["cloudinary://image:webp:cira-pm/avatars/user-1/old-photo"]);
  assert.ok(updated.avatarUrl?.startsWith("https://res.cloudinary.com/cira-pm-test/"));
  assert.ok(updated.avatarUrl?.includes("cira-pm/avatars/user-1/new-photo.webp"));

  // Skenario rollback bila update DB gagal setelah upload sukses
  destroyedRefs.length = 0;
  authRepository.updateAvatar = async () => {
    throw new Error("Database write failed");
  };

  await assert.rejects(
    () => authService.uploadAvatar("user-1", "data:image/webp;base64,aGVsbG8="),
    /Database write failed/,
  );
  assert.deepEqual(destroyedRefs, ["cloudinary://image:webp:cira-pm/avatars/user-1/new-photo"]);
});

// ==========================================
// AC-2: Konsistensi Signed Avatar URL Lintas API & Fallback Null
// ==========================================

test("AC-2: withResolvedUserAvatar menandatangani referensi Cloudinary dan mempertahankan null saat kosong", () => {
  assert.equal(withResolvedUserAvatar(null), null);
  assert.equal(withResolvedUserAvatar(undefined), undefined);

  const withoutAvatar = withResolvedUserAvatar({
    id: "u-empty",
    name: "Tanpa Foto",
    avatarUrl: null,
  });
  assert.equal(withoutAvatar?.avatarUrl, null);

  const withAvatar = withResolvedUserAvatar({
    id: "u-photo",
    name: "Budi Santoso",
    avatarUrl: "cloudinary://image:png:cira-pm/avatars/u-photo/avatar1",
  });
  assert.ok(withAvatar?.avatarUrl?.startsWith("https://res.cloudinary.com/cira-pm-test/"));
  assert.ok(withAvatar?.avatarUrl?.includes("/authenticated/"));
  assert.ok(withAvatar?.avatarUrl?.includes("cira-pm/avatars/u-photo/avatar1.png"));
});

test("AC-2: seluruh service Direktori, Proyek, Governance, Task, Sprint, dan Aktivitas mengembalikan signed avatarUrl", async (t) => {
  const originalGetDirectoryUsers = authRepository.getDirectoryUsers;
  const originalProjectsFindMany = projectsRepository.findMany;
  const originalProjectsFindById = projectsRepository.findById;
  const originalGetRoster = governanceRepository.getRoster;
  const originalFindPendingReq = governanceRepository.findActivePendingRequest;
  const originalTasksFindProject = tasksRepository.findProjectById;
  const originalTasksFindByProject = tasksRepository.findTasksByProjectId;
  const originalTasksCheckDp = tasksRepository.checkProjectDpStatus;
  const originalSprintsFindById = sprintsRepository.findById;
  const originalActivityFindProject = activityRepository.findProjectById;
  const originalActivityFindByProject = activityRepository.findByProjectId;

  t.after(() => {
    authRepository.getDirectoryUsers = originalGetDirectoryUsers;
    projectsRepository.findMany = originalProjectsFindMany;
    projectsRepository.findById = originalProjectsFindById;
    governanceRepository.getRoster = originalGetRoster;
    governanceRepository.findActivePendingRequest = originalFindPendingReq;
    tasksRepository.findProjectById = originalTasksFindProject;
    tasksRepository.findTasksByProjectId = originalTasksFindByProject;
    tasksRepository.checkProjectDpStatus = originalTasksCheckDp;
    sprintsRepository.findById = originalSprintsFindById;
    activityRepository.findProjectById = originalActivityFindProject;
    activityRepository.findByProjectId = originalActivityFindByProject;
  });

  const storedRef = "cloudinary://image:webp:cira-pm/avatars/u-1/p1";
  const expectSignedUrl = (value: string | null | undefined) => {
    assert.ok(
      typeof value === "string" &&
        value.startsWith("https://res.cloudinary.com/cira-pm-test/") &&
        value.includes("cira-pm/avatars/u-1/p1.webp"),
      `Expected signed Cloudinary delivery URL, got: ${String(value)}`,
    );
  };

  // 1. Direktori Tim
  authRepository.getDirectoryUsers = (async () => [
    {
      id: "u-1",
      name: "Andi",
      email: "andi@cira.id",
      whatsapp: null,
      instagram: null,
      roles: ["owner"],
      isActive: true,
      isPrimaryOwner: true,
      avatarUrl: storedRef,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "u-2",
      name: "Budi",
      email: "budi@cira.id",
      whatsapp: null,
      instagram: null,
      roles: ["developer"],
      isActive: true,
      isPrimaryOwner: false,
      avatarUrl: null,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  ]) as unknown as typeof authRepository.getDirectoryUsers;

  const directory = await authService.getDirectory();
  expectSignedUrl(directory[0].avatarUrl);
  assert.equal(directory[1].avatarUrl, null);

  // 2. Daftar & Detail Proyek
  const baseProject = {
    id: "proj-1",
    name: "Cira App",
    clientName: "PT Maju",
    clientContact: "08111",
    status: "active",
    contractValue: "10000000",
    owner: { id: "u-1", name: "Andi", email: "andi@cira.id", avatarUrl: storedRef },
    roster: [
      {
        id: "r-1",
        projectId: "proj-1",
        userId: "u-1",
        roleInProject: "owner",
        user: {
          id: "u-1",
          name: "Andi",
          email: "andi@cira.id",
          roles: ["owner"],
          avatarUrl: storedRef,
          whatsapp: null,
          instagram: null,
          isActive: true,
        },
      },
    ],
    statusRequests: [
      {
        id: "req-1",
        votes: [
          {
            id: "v-1",
            userId: "u-1",
            vote: "approve",
            user: { id: "u-1", name: "Andi", email: "andi@cira.id", roles: ["owner"], avatarUrl: storedRef },
          },
        ],
      },
    ],
    payments: [],
  };

  projectsRepository.findMany = (async () => [baseProject]) as unknown as typeof projectsRepository.findMany;
  projectsRepository.findById = (async () => baseProject) as unknown as typeof projectsRepository.findById;

  const allProjects = await projectsService.getAllProjects({});
  expectSignedUrl(allProjects[0].owner?.avatarUrl);

  const detailProject = await projectsService.getProjectById("proj-1");
  expectSignedUrl(detailProject.owner?.avatarUrl);
  expectSignedUrl(detailProject.roster?.[0].user?.avatarUrl);
  expectSignedUrl(detailProject.statusRequests?.[0].votes?.[0].user?.avatarUrl);

  // 3. Governance (Roster & Active Status Request)
  governanceRepository.getRoster = (async () => [
    ...baseProject.roster,
    {
      id: "r-2",
      projectId: "proj-1",
      userId: "u-2",
      roleInProject: "developer",
      user: {
        id: "u-2",
        name: "Budi",
        email: "budi@cira.id",
        roles: ["developer"],
        avatarUrl: null,
        whatsapp: null,
        instagram: null,
        isActive: true,
      },
    },
  ]) as unknown as typeof governanceRepository.getRoster;
  governanceRepository.findActivePendingRequest = (async () =>
    baseProject.statusRequests[0]) as unknown as typeof governanceRepository.findActivePendingRequest;

  const roster = await governanceService.getRoster("proj-1");
  expectSignedUrl(roster[0].user?.avatarUrl);
  assert.equal(roster[1].user?.avatarUrl, null);

  const activeReq = await governanceService.getActiveStatusRequest("proj-1");
  expectSignedUrl(activeReq?.votes?.[0].user?.avatarUrl);

  // 4. Tasks
  tasksRepository.findProjectById = (async () => ({ id: "proj-1" })) as unknown as typeof tasksRepository.findProjectById;
  tasksRepository.checkProjectDpStatus = async () => true;
  tasksRepository.findTasksByProjectId = (async () => [
    {
      id: "task-1",
      title: "Crop Avatar",
      status: "todo",
      assignee: { id: "u-1", name: "Andi", email: "andi@cira.id", avatarUrl: storedRef },
    },
    {
      id: "task-2",
      title: "Empty Avatar Assignee",
      status: "done",
      assignee: { id: "u-2", name: "Budi", email: "budi@cira.id", avatarUrl: null },
    },
  ]) as unknown as typeof tasksRepository.findTasksByProjectId;

  const taskResult = await tasksService.getTasksByProjectId("proj-1");
  expectSignedUrl(taskResult.tasks[0].assignee?.avatarUrl);
  assert.equal(taskResult.tasks[1].assignee?.avatarUrl, null);

  // 5. Sprints
  sprintsRepository.findById = (async () => ({
    id: "sprint-1",
    projectId: "proj-1",
    project: { id: "proj-1", ownerId: "u-1" },
    tasks: [
      {
        id: "task-1",
        title: "Crop Avatar",
        assignee: { id: "u-1", name: "Andi", email: "andi@cira.id", avatarUrl: storedRef },
      },
    ],
  })) as unknown as typeof sprintsRepository.findById;

  const sprint = await sprintsService.getSprintById("sprint-1", {
    id: "u-1",
    email: "andi@cira.id",
    name: "Andi",
    roles: ["owner"],
  });
  expectSignedUrl(sprint.tasks[0].assignee?.avatarUrl);

  // 6. Activity Timeline
  activityRepository.findProjectById = (async () => ({ id: "proj-1", name: "Cira App" })) as unknown as typeof activityRepository.findProjectById;
  activityRepository.findByProjectId = (async () => [
    {
      id: "act-1",
      category: "project",
      action: "UPDATE",
      description: "Memperbarui foto",
      user: { id: "u-1", name: "Andi", email: "andi@cira.id", avatarUrl: storedRef, role: "owner" },
    },
    {
      id: "act-2",
      category: "project",
      action: "SYSTEM",
      description: "Snapshot tanpa user aktif",
      user: { id: null, name: "Pengguna", email: null, avatarUrl: null, role: "Anggota" },
    },
  ]) as unknown as typeof activityRepository.findByProjectId;

  const activities = await activityService.getProjectActivities("proj-1", {});
  expectSignedUrl(activities[0].user?.avatarUrl);
  assert.equal(activities[1].user?.avatarUrl, null);
});
