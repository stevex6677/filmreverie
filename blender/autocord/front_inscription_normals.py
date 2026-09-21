"""Recover smooth inscription-surface shading without moving the scanned mesh."""
import numpy as np


def inscription_normals(mesh, coords, indices, regions):
    """Fit each narrow physical strip; retain every other original corner normal."""
    normals = np.empty((len(mesh.loops), 3), np.float32)
    mesh.corner_normals.foreach_get('vector', normals.ravel())
    reports = {}
    for name, loop_ids in regions.items():
        vertex_ids = np.unique(indices[loop_ids])
        points = coords[vertex_ids].astype(np.float64)
        origin = points[:, (0, 2)].mean(axis=0)
        scale = np.maximum(np.ptp(points[:, (0, 2)], axis=0), .01)
        x, z = ((points[:, (0, 2)]-origin)/scale).T
        design = np.column_stack((np.ones(len(x)), x, z, x*x, x*z, z*z))
        keep = np.ones(len(points), bool)
        for _ in range(5):
            coefficients = np.linalg.lstsq(design[keep], points[keep, 1], rcond=None)[0]
            residual = points[:, 1]-design@coefficients
            center = np.median(residual)
            deviation = np.median(np.abs(residual-center))
            keep = np.abs(residual-center) < max(3.7*deviation, .00015)
        x, z = ((coords[indices[loop_ids]][:, (0, 2)]-origin)/scale).T
        dx = (coefficients[1]+2*coefficients[3]*x+coefficients[4]*z)/scale[0]
        dz = (coefficients[2]+coefficients[4]*x+2*coefficients[5]*z)/scale[1]
        smooth = np.column_stack((dx, -np.ones(len(x)), dz))
        smooth /= np.linalg.norm(smooth, axis=1)[:, None]
        normals[loop_ids] = smooth
        reports[name] = {'updated_corners': int(len(loop_ids)), 'moved_vertices': 0,
                         'fit_inliers': int(keep.sum()), 'sampled_vertices': int(len(points)),
                         'depth_residual_percentiles': np.percentile(np.abs(residual), [50, 90, 99]).tolist()}
    mesh.normals_split_custom_set(normals)
    return reports
