import type { ProjectSnapshot } from '../../lib/dashboardModel';
import styles from './ProjectSidebar.module.css';

interface ProjectSidebarProps {
  projects: readonly ProjectSnapshot[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

export const ProjectSidebar = ({ projects, selectedProjectId, onSelectProject }: ProjectSidebarProps) => (
  <section className={styles.sidebar}>
    <h2 className={styles.title}>Projects</h2>
    <p className={styles.subtitle}>Native Ashfox only</p>
    <div className={styles.list}>
      {projects.map((project) => {
        const selected = project.projectId === selectedProjectId;
        return (
          <button
            key={project.projectId}
            onClick={() => onSelectProject(project.projectId)}
            type="button"
            className={`${styles.projectButton} ${selected ? styles.projectButtonSelected : ''}`.trim()}
          >
            <strong className={styles.projectName}>{project.name}</strong>
            <div className={styles.projectMeta}>
              rev {project.revision} · bones {project.stats.bones} · cubes {project.stats.cubes}
            </div>
          </button>
        );
      })}
    </div>
  </section>
);
