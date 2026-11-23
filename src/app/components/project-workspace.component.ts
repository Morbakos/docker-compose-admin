import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { ComposeAction, ComposeContainer, ComposeProject } from "../docker.service";
import { ServiceSelectionComponent } from "./service-selection.component";
import { ContainerListComponent } from "./container-list.component";
import { LogsPanelComponent } from "./logs-panel.component";

@Component({
  selector: "app-project-workspace",
  standalone: true,
  imports: [ServiceSelectionComponent, ContainerListComponent, LogsPanelComponent],
  template: `
    <div class="project-header">
      <div class="project-title"><div class="project-icon">▦</div><div><span class="eyebrow">VOTRE ENVIRONNEMENT LOCAL</span><h1>{{ project.name }}</h1><p>{{ project.relativeDirectory }}</p></div></div>
      <span class="status" [class.running]="project.status === 'running'"><i></i>{{ project.status === 'running' ? 'En cours' : project.status === 'stopped' ? 'Arrêté' : 'État inconnu' }}</span>
    </div>
    <div class="action-bar">
      @if (project.status === 'running') {
        <button class="primary stop" type="button" [disabled]="busy" (click)="projectAction.emit('stop')">■ Arrêter l’environnement</button>
      } @else {
        <button class="primary" type="button" [disabled]="busy || selectedServices.length === 0" (click)="projectAction.emit('start')">▶ Démarrer l’environnement</button>
      }
      <button class="secondary" type="button" [disabled]="busy || selectedServices.length === 0" (click)="projectAction.emit('restart')">↻ Redémarrer</button>
      <button class="secondary" type="button" [disabled]="busy" (click)="projectAction.emit('pull')">↓ Récupérer les images</button>
      <span class="action-spacer"></span>
      <button class="open-app" type="button" [disabled]="!applicationUrl" (click)="openApplication.emit()">Ouvrir l’application ↗</button>
    </div>
    <app-service-selection [services]="project.services" [selected]="selectedServices" (toggle)="serviceToggle.emit($event)" (selectAll)="selectAll.emit()" (clear)="clearSelection.emit()" />
    <div class="lower-grid">
      <app-container-list [containers]="containers" [loading]="containersLoading" [busy]="busy" (action)="serviceAction.emit($event)" />
      <aside class="project-info"><h2>Détails du projet</h2><div class="info-row"><span>Fichiers Compose</span><strong>{{ project.composeFiles.length }}</strong></div><div class="file-list">@for (file of project.composeFiles; track file) { <div>▤ <span [title]="file">{{ file }}</span></div> }</div><button type="button" class="logs-button" [disabled]="loadingLogs" (click)="showLogs.emit()">Consulter les logs</button></aside>
    </div>
    @if (showingLogs) { <app-logs-panel [logs]="logs" [loading]="loadingLogs" (close)="closeLogs.emit()" /> }
  `,
  styles: [`
    :host{display:grid;gap:20px}.project-header{display:flex;justify-content:space-between;align-items:center;gap:16px}.project-title{display:flex;align-items:center;gap:15px}.project-icon{display:grid;width:54px;height:54px;place-items:center;border-radius:14px;color:#3568bb;background:#eaf1ff;font-size:27px}.eyebrow{color:#6685bd;font-size:11px;font-weight:750;letter-spacing:1px}
    h1{margin:4px 0;color:#1d2b42;font-size:30px;letter-spacing:-.6px}.project-title p{margin:0;color:#8995a7;font-size:13px;overflow-wrap:anywhere}.status{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:20px;color:#a17c44;background:#fff5e8;font-size:12px;font-weight:700;white-space:nowrap}.status i{width:7px;height:7px;border-radius:50%;background:#d69c4d}.status.running{color:#25875e;background:#eaf8f1}.status.running i{background:#35b77c}
    .action-bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:14px;border:1px solid #e5eaf1;border-radius:13px;background:#fff}.action-bar button,.logs-button{min-height:39px;padding:0 14px;border:1px solid #e0e7f0;border-radius:8px;color:#596a82;background:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer}.action-bar .primary{border-color:#2862cd;color:#fff;background:#2862cd}.action-bar .primary.stop{border-color:#efd9d2;color:#a65b46;background:#fff8f5}.action-bar .open-app{border-color:#cfe9da;color:#247b55;background:#f2fbf6}.action-bar button:disabled,.logs-button:disabled{opacity:.5;cursor:not-allowed}.action-spacer{flex:1}
    .lower-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(230px,.8fr);gap:18px;align-items:start}.project-info{padding:21px;border:1px solid #e5eaf1;border-radius:14px;background:#fff}.project-info h2{margin:0 0 16px;color:#27364d;font-size:17px}.info-row{display:flex;justify-content:space-between;color:#8995a7;font-size:12px}.info-row strong{color:#46566e}.file-list{display:grid;gap:9px;margin:13px 0 20px}.file-list div{display:flex;gap:7px;align-items:center;color:#91a0b4;font-size:12px}.file-list span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.logs-button{width:100%;color:#4e6c9f;background:#f8faff}
    @media(max-width:850px){.lower-grid{grid-template-columns:1fr}}@media(max-width:600px){.project-header{align-items:flex-start;flex-direction:column}h1{font-size:25px}.action-spacer{display:none}.action-bar button{flex:1}.action-bar .open-app{flex-basis:100%}}
  `],
})
export class ProjectWorkspaceComponent {
  @Input({required:true}) project!: ComposeProject;
  @Input() containers: ComposeContainer[] = [];
  @Input() containersLoading = false;
  @Input() selectedServices: string[] = [];
  @Input() busy = false;
  @Input() applicationUrl: string | null = null;
  @Input() logs: string | null = null;
  @Input() showingLogs = false;
  @Input() loadingLogs = false;
  @Output() projectAction = new EventEmitter<ComposeAction>();
  @Output() serviceToggle = new EventEmitter<string>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() clearSelection = new EventEmitter<void>();
  @Output() serviceAction = new EventEmitter<{container:ComposeContainer; action:"start"|"stop"|"restart"}>();
  @Output() openApplication = new EventEmitter<void>();
  @Output() showLogs = new EventEmitter<void>();
  @Output() closeLogs = new EventEmitter<void>();
}