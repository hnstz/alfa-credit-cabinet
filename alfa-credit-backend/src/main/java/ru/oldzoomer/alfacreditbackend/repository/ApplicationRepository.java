package ru.oldzoomer.alfacreditbackend.repository;

import org.springframework.data.domain.Sort;
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ru.oldzoomer.alfacreditbackend.entity.Application;
import ru.oldzoomer.alfacreditbackend.entity.ApplicationStatus;

import java.util.List;
import java.util.Optional;

@Repository
public interface ApplicationRepository extends CrudRepository<Application, String> {

    List<Application> findByUserIdOrderByUpdatedAtDesc(String userId);

    List<Application> findByStatus(ApplicationStatus status);

    List<Application> findByStatusOrderByUpdatedAtDesc(ApplicationStatus status);

    Optional<Application> findByNumber(String number);

    /**
     * Поиск по номеру, названию компании или ИНН (через userId → users → company_id).
     */
    @Query("""
            SELECT a.* FROM applications a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE a.status != 'DRAFT'
              AND (a.number ILIKE :q OR c.name ILIKE :q OR c.inn ILIKE :q)
            ORDER BY a.updated_at DESC
            """)
    List<Application> searchByQuery(@Param("q") String q, Sort sort);

    @Query("""
            SELECT a.* FROM applications a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE a.status != 'DRAFT'
            ORDER BY a.updated_at DESC
            """)
    List<Application> findAllExcludingDrafts(Sort sort);
}
