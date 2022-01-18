import dotenv from 'dotenv';
import { Reshuffle } from "reshuffle";
const { AsanaConnector } = require("reshuffle-asana-connector");
const { GitHubConnector } = require("reshuffle-github-connector");
dotenv.config();

const app = new Reshuffle();
app.port = process.env.PORT as any || 5000;

//Github Config
const githubConnector = new GitHubConnector(app, {
    token: process.env.GITHUB_TOKEN,
    runtimeBaseUrl: process.env.BASE_URL,
});

// Asana config
const asanaConnector = new AsanaConnector(app, {
    accessToken: process.env.ASANA_ACCESS_TOKEN,
    baseURL: process.env.BASE_URL,
    workspaceId: process.env.ASANA_WORKSPACE_ID,
});

githubConnector.on({
    interval: process.env.SYNC_INTERVAL,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    githubEvent: "issues",
}, async (event: any, app: any) => {

    const githubIssue = event.issue;

    if ((githubIssue.labels.map((label: any) => label.name)).includes("asana")) {

        // github issue includes "asana" tag

        const project = await asanaConnector.sdk().projects.findById(process.env.ASANA_PROJECT_ID);
        const { data } = await asanaConnector.sdk().tasks.findByProject(process.env.ASANA_PROJECT_ID)

        const asanaTask = data.find((task: any) => {
            return task.name.includes(`#${githubIssue.number}`);
        });

        if (asanaTask) {

            if (asanaTask.name !== `${githubIssue.title} #${githubIssue.number}`) {
                console.log('updating existing asanaTask', asanaTask.gid);
                await asanaConnector.sdk().tasks.update(asanaTask.gid, {
                    name: `${githubIssue.title} #${githubIssue.number}`.trim(),
                });
            } else {
                console.log('nothing to change really')
            }

        } else {

            console.log('creating new asanaTask');

            await asanaConnector.sdk().tasks.createInWorkspace(project.workspace.gid, {
                name: `${githubIssue.title} #${githubIssue.number}`.trim(),
                projects: process.env.ASANA_PROJECT_ID,
                tags: process.env.ASANA_TAG,
            });

        }

    }

});

asanaConnector.on({
    interval: process.env.SYNC_INTERVAL,
    gid: process.env.ASANA_PROJECT_ID,
    asanaEvent: "changed",
}, async (event: any, app: any) => {

    const asanaTask = await asanaConnector.sdk().tasks.findById(event.resource.gid);

    console.log(asanaTask.tags.map((tag: any) => tag.gid))

    if (asanaTask.tags.map((tag: any) => tag.gid).includes(process.env.ASANA_TAG)) {

        // asana task includes "github" tag

        const { data } = await githubConnector.sdk().issues.listForRepo({
            repo: process.env.GITHUB_REPO,
            owner: process.env.GITHUB_OWNER,
        });

        const githubIssue = data.find((issue: any) => {
            return asanaTask.name.includes(`#${issue.number}`);
        });

        if (githubIssue) {

            if (asanaTask.name !== `${githubIssue.title} #${githubIssue.number}`) {
                console.log('updating existing githubIssue', githubIssue.number);
                await githubConnector.sdk().issues.update({
                    owner: process.env.GITHUB_OWNER,
                    repo: process.env.GITHUB_REPO,
                    issue_number: githubIssue.number,
                    title: asanaTask.name.split("#")[0].trim(),
                    state: asanaTask.completed ? "closed" : "open",
                });
            } else {
                console.log('nothing to change really')
            }

        } else {

            await asanaConnector.sdk().tasks.delete(asanaTask.gid);

            // await githubConnector.sdk().issues.create({
            //     owner: process.env.GITHUB_OWNER,
            //     repo: process.env.GITHUB_REPO,
            //     title: asanaTask.name.split("#")[0].trim(),
            //     state: "open",
            // });

        }

    }

});

app.start();